import { BadGatewayException, Injectable } from '@nestjs/common'
import { createPrismaBase, MODELS } from '@/prisma/util/prisma.util'
import { v7 as uuidv7 } from 'uuid'
import { SQS } from '@aws-sdk/client-sqs'
import { ExperimentRunStatus } from '@prisma/client'
import { Cron } from '@nestjs/schedule'
import { randomUUID } from 'crypto'
import { subMinutes } from 'date-fns'
import { AgentJobContracts } from '@/generated/agent-job-contracts'

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

const isJsonObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

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
  private async resolveQueueUrl(): Promise<string | undefined> {
    const queueName = process.env.AGENT_DISPATCH_QUEUE_NAME
    if (!queueName) {
      return
    }

    const { QueueUrl } = await sqs.getQueueUrl({ QueueName: queueName })

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

  async dispatchRun<ExperimentType extends keyof AgentJobContracts>(
    input: ExperimentRunDispatchInput<ExperimentType>,
  ) {
    const QueueUrl = await this.resolveQueueUrl()
    if (!QueueUrl) {
      this.logger.warn(
        'No Queue Url found for agent dispatch, not configured for this environment',
      )
      return
    }

    const runId = uuidv7()

    const result = await this.model.create({
      data: {
        runId,
        experimentType: input.type,
        organizationSlug: input.organizationSlug,
        status: ExperimentRunStatus.RUNNING,
        params: input.params,
      },
    })

    try {
      await this.enqueueDispatch(QueueUrl, {
        runId,
        organizationSlug: input.organizationSlug,
        experimentType: input.type,
        clerkUserId: input.clerkUserId,
        params: input.params,
      })
    } catch (error) {
      this.logger.error(
        {
          error,
          runId,
          experimentType: input.type,
          organizationSlug: input.organizationSlug,
        },
        'Failed to send dispatch message to SQS',
      )
      await this.model.update({
        where: { runId },
        data: { status: 'FAILED', error: 'SQS dispatch failed' },
      })
      throw new BadGatewayException(
        'Failed to dispatch experiment. Please try again.',
      )
    }

    this.logger.info(
      {
        runId,
        experimentType: input.type,
        organizationSlug: input.organizationSlug,
      },
      'Experiment dispatched',
    )

    return result
  }

  async resumeRun(run: ResumeRunInput) {
    const QueueUrl = await this.resolveQueueUrl()
    if (!QueueUrl) {
      this.logger.warn(
        { runId: run.runId },
        'No Queue Url configured — cannot resume run in this environment',
      )
      return
    }

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
      return
    }

    const claimed = await this.model.updateMany({
      where: {
        runId: run.runId,
        status: ExperimentRunStatus.AWAITING_RESUME,
      },
      data: {
        status: ExperimentRunStatus.RUNNING,
        resumeAttempts: { increment: 1 },
        resumeScheduledFor: null,
      },
    })

    if (claimed.count === 0) {
      return
    }

    const resumeParams =
      typeof run.params === 'object' && run.params !== null
        ? { ...run.params, trigger: 'recovery_resume' }
        : { trigger: 'recovery_resume' }

    try {
      await this.enqueueDispatch(QueueUrl, {
        runId: run.runId,
        organizationSlug: run.organizationSlug,
        experimentType: run.experimentType,
        clerkUserId,
        params: resumeParams,
      })
    } catch (error) {
      this.logger.error(
        { error, runId: run.runId },
        'Failed to re-enqueue resumed run — releasing claim',
      )
      await this.model.update({
        where: { runId: run.runId },
        data: {
          status: ExperimentRunStatus.AWAITING_RESUME,
          resumeAttempts: { decrement: 1 },
          resumeScheduledFor: new Date(),
        },
      })
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
        await this.resumeRun(run)
      }
    }
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
