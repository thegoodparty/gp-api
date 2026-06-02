import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common'
import { ExperimentRun, ExperimentRunStatus, Prisma } from '@prisma/client'
import {
  AgentRunCandidateSummary,
  AgentRunListItem,
  AgentRunsListQuery,
  PaginatedList,
} from '@goodparty_org/contracts'
import { createPrismaBase, MODELS } from '@/prisma/util/prisma.util'
import { S3Service } from '@/vendors/aws/services/s3.service'
import { ExperimentRunsService } from '@/agentExperiments/services/experimentRuns.service'
import { AgentJobContracts } from '@/generated/agent-job-contracts'
import { isJsonObject } from '@/shared/util/objects.util'
import {
  DEFAULT_PAGINATION_LIMIT,
  DEFAULT_PAGINATION_OFFSET,
} from '@/shared/constants/paginationOptions.consts'

const parseArtifact = (raw: string): Record<string, unknown> =>
  // JSON.parse returns any; the artifact is opaque at this boundary and is
  // validated against AgentRunDetailSchema by the response interceptor.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  JSON.parse(raw) as Record<string, unknown>

// compliance_setup is the only experiment whose params carry a candidate; for
// every other experiment type the fields are absent and this returns null.
// params is an opaque Json column (typed `unknown`), so narrow before reading.
const deriveCandidate = (params: unknown): AgentRunCandidateSummary | null => {
  if (!isJsonObject(params)) return null
  const firstName = params['candidate_first_name']
  const lastName = params['candidate_last_name']
  if (typeof firstName !== 'string' || typeof lastName !== 'string') {
    return null
  }
  const campaignId = params['campaign_id']
  return {
    firstName,
    lastName,
    campaignId: typeof campaignId === 'number' ? campaignId : null,
  }
}

// Retry re-dispatches as the run's candidate, so only experiments whose params
// carry a clerk_user_id are retryable. Today that is compliance_setup; the
// `satisfies` keeps this list honest against the generated contract keys.
const DISPATCHABLE_EXPERIMENT_TYPES = [
  'compliance_setup',
] as const satisfies readonly (keyof AgentJobContracts)[]

type DispatchableExperimentType = (typeof DISPATCHABLE_EXPERIMENT_TYPES)[number]

type DispatchParams = AgentJobContracts[DispatchableExperimentType]['Input']

const isDispatchableExperimentType = (
  type: string,
): type is DispatchableExperimentType =>
  DISPATCHABLE_EXPERIMENT_TYPES.some((known) => known === type)

const clerkUserIdFromParams = (params: unknown): string | null => {
  if (!isJsonObject(params)) return null
  const clerkUserId = params['clerk_user_id']
  return typeof clerkUserId === 'string' ? clerkUserId : null
}

const toListItem = (run: ExperimentRun): AgentRunListItem => ({
  runId: run.runId,
  experimentType: run.experimentType,
  status: run.status,
  organizationSlug: run.organizationSlug,
  candidate: deriveCandidate(run.params),
  durationSeconds: run.durationSeconds,
  costUsd: run.costUsd,
  createdAt: run.createdAt,
  stage: run.stage,
  dataQuality: run.dataQuality,
  resumeScheduledFor: run.resumeScheduledFor,
  resumeAttempts: run.resumeAttempts,
})

@Injectable()
export class AdminAgentRunsService extends createPrismaBase(
  MODELS.ExperimentRun,
) {
  constructor(
    private readonly s3: S3Service,
    private readonly experimentRuns: ExperimentRunsService,
  ) {
    super()
  }

  async list({
    offset = DEFAULT_PAGINATION_OFFSET,
    limit = DEFAULT_PAGINATION_LIMIT,
    experimentType,
    status,
    organizationSlug,
    createdAfter,
    createdBefore,
  }: AgentRunsListQuery): Promise<PaginatedList<AgentRunListItem>> {
    const where: Prisma.ExperimentRunWhereInput = {
      ...(experimentType ? { experimentType } : {}),
      ...(status ? { status } : {}),
      ...(organizationSlug ? { organizationSlug } : {}),
      ...(createdAfter || createdBefore
        ? {
            createdAt: {
              ...(createdAfter ? { gte: createdAfter } : {}),
              ...(createdBefore ? { lte: createdBefore } : {}),
            },
          }
        : {}),
    }

    const [runs, total] = await Promise.all([
      this.model.findMany({
        where,
        orderBy: { createdAt: Prisma.SortOrder.desc },
        skip: offset,
        take: limit,
      }),
      this.model.count({ where }),
    ])

    return { data: runs.map(toListItem), meta: { total, offset, limit } }
  }

  // Re-dispatches a finished run with its stored params as the same candidate.
  // dispatchRun creates a fresh run row + SQS message; the original is untouched.
  async retry(runId: string): Promise<ExperimentRun> {
    const run = await this.model.findUniqueOrThrow({ where: { runId } })

    // A RUNNING run is still in flight; re-dispatching it would spawn a second
    // parallel worker on the same params (duplicate domain buy / TCR submit).
    if (run.status === ExperimentRunStatus.RUNNING) {
      throw new ConflictException(
        'run is still RUNNING; only finished runs can be retried',
      )
    }

    if (!isDispatchableExperimentType(run.experimentType)) {
      throw new BadRequestException(
        `experiment type "${run.experimentType}" cannot be re-dispatched`,
      )
    }

    const clerkUserId = clerkUserIdFromParams(run.params)
    if (!clerkUserId) {
      throw new BadRequestException(
        'run params carry no clerk_user_id; cannot re-dispatch as the candidate',
      )
    }

    // params were validated against this experiment's Input at the original
    // dispatch and persisted unchanged, so re-forward them as that Input.
    // Override trigger to recovery_resume so the agent treats this as a
    // re-dispatch (consult durable gp-api state), not a first-time dispatch that
    // would re-run paid side effects (domain purchase, TCR submission). Drop a
    // stale run_id so the agent falls back to the fresh dispatch's run id rather
    // than filing the artifact under the original run.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const storedParams = run.params as DispatchParams
    const params: DispatchParams = {
      ...storedParams,
      trigger: 'recovery_resume',
      run_id: undefined,
    }

    const dispatched = await this.experimentRuns.dispatchRun({
      type: run.experimentType,
      organizationSlug: run.organizationSlug,
      clerkUserId,
      params,
    })

    // dispatchRun no-ops (returns undefined) when no queue is configured, e.g.
    // preview envs. Surface that instead of returning a 200 with no new run.
    if (!dispatched) {
      throw new BadGatewayException(
        'agent dispatch is not configured for this environment',
      )
    }

    return dispatched
  }

  async detail(runId: string): Promise<{
    run: ExperimentRun
    artifact: Record<string, unknown> | null
    conversationLog: string | null
  }> {
    const run = await this.model.findUniqueOrThrow({ where: { runId } })

    const artifact =
      run.artifactBucket && run.artifactKey
        ? await this.loadArtifact(run.artifactBucket, run.artifactKey, runId)
        : null

    const conversationLog = run.artifactBucket
      ? await this.loadConversationLog(
          run.artifactBucket,
          run.experimentType,
          runId,
        )
      : null

    return { run, artifact, conversationLog }
  }

  // getFile returns undefined on a missing key (NoSuchKey is swallowed there),
  // so a still-RUNNING run or an absent artifact maps to null, not a 500.
  private async loadArtifact(
    bucket: string,
    key: string,
    runId: string,
  ): Promise<Record<string, unknown> | null> {
    const raw = await this.s3.getFile(bucket, key)
    if (!raw) return null
    try {
      return parseArtifact(raw)
    } catch {
      this.logger.error({ runId }, 'agent-run artifact is not valid JSON')
      return null
    }
  }

  private async loadConversationLog(
    bucket: string,
    experimentType: string,
    runId: string,
  ): Promise<string | null> {
    const key = `${experimentType}/${runId}/logs/workspace/conversation.log`
    return (await this.s3.getFile(bucket, key)) ?? null
  }
}
