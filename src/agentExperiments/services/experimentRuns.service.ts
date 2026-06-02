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

    const messageBody = {
      run_id: runId,
      params: input.params,
      organization_slug: input.organizationSlug,
      experiment_type: input.type,
      clerk_user_id: input.clerkUserId,
    }

    const deduplicationId = randomUUID()

    try {
      await sqs.sendMessage({
        QueueUrl,
        MessageBody: JSON.stringify(messageBody),
        MessageGroupId: `agent-dispatch-${input.organizationSlug}`,
        MessageDeduplicationId: deduplicationId,
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
        createdAt: { lt: cutoff },
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
