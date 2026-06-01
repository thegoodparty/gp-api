import { Injectable } from '@nestjs/common'
import { ExperimentRun, Prisma } from '@prisma/client'
import {
  AgentRunCandidateSummary,
  AgentRunListItem,
  AgentRunsListQuery,
  PaginatedList,
} from '@goodparty_org/contracts'
import { createPrismaBase, MODELS } from '@/prisma/util/prisma.util'
import { S3Service } from '@/vendors/aws/services/s3.service'
import {
  DEFAULT_PAGINATION_LIMIT,
  DEFAULT_PAGINATION_OFFSET,
} from '@/shared/constants/paginationOptions.consts'

const parseArtifact = (raw: string): Record<string, unknown> =>
  // JSON.parse returns any; the artifact is opaque at this boundary and is
  // validated against AgentRunDetailSchema by the response interceptor.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  JSON.parse(raw) as Record<string, unknown>

const isJsonObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

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

const toListItem = (run: ExperimentRun): AgentRunListItem => ({
  runId: run.runId,
  experimentType: run.experimentType,
  status: run.status,
  organizationSlug: run.organizationSlug,
  candidate: deriveCandidate(run.params),
  durationSeconds: run.durationSeconds,
  costUsd: run.costUsd,
  createdAt: run.createdAt,
})

@Injectable()
export class AdminAgentRunsService extends createPrismaBase(
  MODELS.ExperimentRun,
) {
  constructor(private readonly s3: S3Service) {
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
