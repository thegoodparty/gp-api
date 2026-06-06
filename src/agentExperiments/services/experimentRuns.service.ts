import { BadGatewayException, Injectable } from '@nestjs/common'
import { createPrismaBase, MODELS } from '@/prisma/util/prisma.util'
import { v7 as uuidv7 } from 'uuid'
import { SQS } from '@aws-sdk/client-sqs'
import {
  ExperimentRun,
  ExperimentRunStatus,
  Prisma,
} from '../../generated/prisma'
import { Cron } from '@nestjs/schedule'
import { randomUUID } from 'crypto'
import { subMinutes } from 'date-fns'
import { AgentJobContracts } from '@/generated/agent-job-contracts'
import { isJsonObject } from '@/shared/util/objects.util'

const sqs = new SQS({})

export type ExperimentRunDispatchInput<
  ExperimentType extends keyof AgentJobContracts,
> = {
  type: ExperimentType
  organizationSlug: string
  clerkUserId: string
  params: AgentJobContracts[ExperimentType]['Input']
}

const STALE_THRESHOLD_MINUTES = 45
export const MAX_RESUME_ATTEMPTS = 48
// Drain the resumable backlog incrementally across ticks so a post-pause
// surge can't load an unbounded result set or overrun the 5-minute interval.
const RESUME_SWEEP_BATCH_SIZE = 100

type ResumeRunInput = {
  runId: string
  organizationSlug: string
  experimentType: string
  params: unknown
  stage?: string | null
  resumeAttempts: number
}

@Injectable()
export class ExperimentRunsService extends createPrismaBase(
  MODELS.ExperimentRun,
) {
  private cachedQueueUrl: string | undefined

  // The queue name is static per environment, so resolve the URL once and cache
  // it on the instance — a sweep re-dispatching N runs would otherwise issue N
  // GetQueueUrl calls.
  private async resolveQueueUrl(): Promise<string | undefined> {
    if (this.cachedQueueUrl) {
      return this.cachedQueueUrl
    }

    const queueName = process.env.AGENT_DISPATCH_QUEUE_NAME
    if (!queueName) {
      return
    }

    const { QueueUrl } = await sqs.getQueueUrl({ QueueName: queueName })
    this.cachedQueueUrl = QueueUrl

    return QueueUrl
  }

  private async enqueueDispatch(
    queueUrl: string,
    input: {
      runId: string
      organizationSlug: string
      experimentType: string
      clerkUserId: string
      params: unknown
    },
  ) {
    const messageBody = {
      run_id: input.runId,
      params: input.params,
      organization_slug: input.organizationSlug,
      experiment_type: input.experimentType,
      clerk_user_id: input.clerkUserId,
    }

    await sqs.sendMessage({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(messageBody),
      MessageGroupId: `agent-dispatch-${input.organizationSlug}`,
      MessageDeduplicationId: randomUUID(),
    })
  }

  private async createAndEnqueueRun(input: {
    experimentType: string
    organizationSlug: string
    clerkUserId: string
    params: Prisma.InputJsonValue
    resumeAttempts?: number
  }): Promise<ExperimentRun | undefined> {
    const queueUrl = await this.resolveQueueUrl()
    if (!queueUrl) {
      this.logger.warn(
        'No Queue Url found for agent dispatch, not configured for this environment',
      )
      return
    }
    const runId = uuidv7()
    const result = await this.model.create({
      data: {
        runId,
        experimentType: input.experimentType,
        organizationSlug: input.organizationSlug,
        status: ExperimentRunStatus.RUNNING,
        params: input.params,
        resumeAttempts: input.resumeAttempts ?? 0,
      },
    })
    try {
      await this.enqueueDispatch(queueUrl, {
        runId,
        organizationSlug: input.organizationSlug,
        experimentType: input.experimentType,
        clerkUserId: input.clerkUserId,
        params: input.params,
      })
    } catch (error) {
      this.logger.error(
        {
          error,
          runId,
          experimentType: input.experimentType,
          organizationSlug: input.organizationSlug,
        },
        'Failed to send dispatch message to SQS',
      )
      await this.model.update({
        where: { runId },
        data: {
          status: ExperimentRunStatus.FAILED,
          error: 'SQS dispatch failed',
        },
      })
      throw new BadGatewayException(
        'Failed to dispatch experiment. Please try again.',
      )
    }
    this.logger.info(
      {
        runId,
        experimentType: input.experimentType,
        organizationSlug: input.organizationSlug,
      },
      'Experiment dispatched',
    )
    return result
  }

  async dispatchRun<ExperimentType extends keyof AgentJobContracts>(
    input: ExperimentRunDispatchInput<ExperimentType>,
  ) {
    return this.createAndEnqueueRun({
      experimentType: input.type,
      organizationSlug: input.organizationSlug,
      clerkUserId: input.clerkUserId,
      // AgentJobContracts inputs are JSON-serializable objects validated by Zod;
      // the assertion bridges the structural index-signature gap that InputJsonObject
      // requires but the generated contract types don't declare.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      params: input.params as Prisma.InputJsonObject,
    })
  }

  async resumeRun(run: ResumeRunInput) {
    const clerkUserId =
      isJsonObject(run.params) &&
      typeof run.params['clerk_user_id'] === 'string'
        ? run.params['clerk_user_id']
        : null

    if (!clerkUserId) {
      this.logger.error(
        { runId: run.runId },
        'run params carry no clerk_user_id; cannot resume without actor identity',
      )
      await this.model.updateMany({
        where: {
          runId: run.runId,
          status: ExperimentRunStatus.AWAITING_RESUME,
        },
        data: {
          status: ExperimentRunStatus.FAILED,
          error: 'Cannot resume: run params carry no clerk_user_id',
        },
      })
      return
    }

    const claimed = await this.model.updateMany({
      where: {
        runId: run.runId,
        status: ExperimentRunStatus.AWAITING_RESUME,
        resumeScheduledFor: { not: null },
      },
      data: { resumeScheduledFor: null },
    })

    if (claimed.count === 0) {
      return
    }

    const resumeParams = {
      ...(isJsonObject(run.params) ? run.params : {}),
      trigger: 'recovery_resume',
    } as Prisma.InputJsonObject

    let dispatched: ExperimentRun | undefined
    try {
      dispatched = await this.createAndEnqueueRun({
        experimentType: run.experimentType,
        organizationSlug: run.organizationSlug,
        clerkUserId,
        params: resumeParams,
        resumeAttempts: run.resumeAttempts + 1,
      })
    } catch (error) {
      this.logger.error(
        { error, runId: run.runId },
        'Failed to dispatch resumed run',
      )
      dispatched = undefined
    }

    if (!dispatched) {
      // Dispatch threw, or no queue is configured (preview env) so no successor
      // was created. Release the claim so the row returns to the sweep instead
      // of being orphaned or falsely marked superseded. Wrap the release so a
      // transient DB error here is logged rather than left silently stuck.
      try {
        await this.model.updateMany({
          where: {
            runId: run.runId,
            status: ExperimentRunStatus.AWAITING_RESUME,
          },
          data: { resumeScheduledFor: new Date() },
        })
      } catch (releaseError) {
        this.logger.error(
          { releaseError, runId: run.runId },
          'Failed to release resume claim — row stuck AWAITING_RESUME with no schedule',
        )
      }
      return
    }

    // A successor run was created; terminalize the old row so it can't linger
    // forever as a non-terminal orphan (the resume sweep ignores a null
    // resumeScheduledFor, and the stale sweep only touches RUNNING).
    try {
      await this.model.updateMany({
        where: {
          runId: run.runId,
          status: ExperimentRunStatus.AWAITING_RESUME,
        },
        data: {
          status: ExperimentRunStatus.FAILED,
          error: 'Superseded by resumed run',
        },
      })
    } catch (supersedeError) {
      this.logger.error(
        { supersedeError, runId: run.runId },
        'Failed to terminalize superseded run — left as AWAITING_RESUME orphan',
      )
    }
  }

  @Cron('*/5 * * * *')
  async sweepResumableRuns() {
    const now = new Date()

    const due = await this.model.findMany({
      where: {
        status: ExperimentRunStatus.AWAITING_RESUME,
        resumeScheduledFor: { lte: now },
      },
      orderBy: { resumeScheduledFor: Prisma.SortOrder.asc },
      take: RESUME_SWEEP_BATCH_SIZE,
    })

    for (const run of due) {
      if (run.resumeAttempts >= MAX_RESUME_ATTEMPTS) {
        await this.model.updateMany({
          where: {
            runId: run.runId,
            status: ExperimentRunStatus.AWAITING_RESUME,
          },
          data: {
            status: ExperimentRunStatus.FAILED,
            error:
              `Exceeded max resume attempts (${run.resumeAttempts}) ` +
              `at stage: ${run.stage ?? 'unknown'}`,
          },
        })
      } else {
        // Isolate each run: a throw from one resume must not abort the rest of
        // the batch (the remaining due runs would be skipped until next tick).
        try {
          await this.resumeRun(run)
        } catch (error) {
          this.logger.error(
            { error, runId: run.runId },
            'resumeRun threw during sweep — continuing with remaining runs',
          )
        }
      }
    }
  }

  // Flip a run to FAILED after the fact, e.g. when a result arrived but the
  // caller couldn't load/persist its artifact. Truncate the error to match the
  // queue-consumer's column bound.
  markFailed(runId: string, error: string) {
    return this.model.update({
      where: { runId },
      data: { status: ExperimentRunStatus.FAILED, error: error.slice(0, 1000) },
    })
  }

  @Cron('*/15 * * * *')
  async sweepStaleRuns() {
    const cutoff = subMinutes(new Date(), STALE_THRESHOLD_MINUTES)
    const result = await this.model.updateMany({
      where: {
        status: { in: [ExperimentRunStatus.RUNNING] },
        updatedAt: { lt: cutoff },
      },
      data: {
        status: ExperimentRunStatus.FAILED,
        error: `Timed out waiting for callback after ${STALE_THRESHOLD_MINUTES} minutes`,
      },
    })

    if (result.count > 0) {
      this.logger.warn(
        { count: result.count, cutoff: cutoff.toISOString() },
        'Marked stale experiment runs as FAILED',
      )
    }
  }
}
