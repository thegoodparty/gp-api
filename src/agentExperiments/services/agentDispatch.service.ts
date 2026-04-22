import { Injectable, BadGatewayException } from '@nestjs/common'
import { SQSClient, SQSClientConfig } from '@aws-sdk/client-sqs'
import { Producer } from 'sqs-producer'
import { PinoLogger } from 'nestjs-pino'
import { randomUUID } from 'crypto'
import { ExperimentRunsService } from './experimentRuns.service'
import type { DispatchExperimentDto } from '../schemas/agentExperiments.schema'

const sqsConfig: SQSClientConfig = {
  region: process.env.AWS_REGION || '',
}

if (process.env.NODE_ENV !== 'production') {
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    sqsConfig.credentials = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    }
  }
}

const resolveQueueUrl = () => {
  const name = process.env.AGENT_DISPATCH_QUEUE_NAME
  const base = process.env.SQS_QUEUE_BASE_URL
  if (!name || !base) return ''
  return `${base}/${name}`
}

const dispatchProducer = Producer.create({
  queueUrl: resolveQueueUrl(),
  sqs: new SQSClient(sqsConfig),
})

@Injectable()
export class AgentDispatchService {
  constructor(
    private readonly logger: PinoLogger,
    private readonly experimentRuns: ExperimentRunsService,
  ) {
    this.logger.setContext(AgentDispatchService.name)
  }

  async dispatch(input: DispatchExperimentDto) {
    const runId = randomUUID()

    await this.experimentRuns.model.create({
      data: {
        runId,
        experimentId: input.experimentId,
        organizationSlug: input.organizationSlug,
        status: 'PENDING',
        params: input.params,
      },
    })

    const messageBody = {
      experiment_id: input.experimentId,
      organization_slug: input.organizationSlug,
      run_id: runId,
      params: input.params,
    }

    const deduplicationId = randomUUID()

    try {
      await dispatchProducer.send({
        id: deduplicationId,
        body: JSON.stringify(messageBody),
        deduplicationId,
        groupId: `agent-dispatch-${input.organizationSlug}`,
      })
    } catch (error) {
      this.logger.error(
        {
          error,
          runId,
          experimentId: input.experimentId,
          organizationSlug: input.organizationSlug,
        },
        'Failed to send dispatch message to SQS',
      )
      await this.experimentRuns.client.experimentRun.update({
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
        experimentId: input.experimentId,
        organizationSlug: input.organizationSlug,
      },
      'Experiment dispatched',
    )

    return {
      runId,
      experimentId: input.experimentId,
      organizationSlug: input.organizationSlug,
      status: 'dispatched' as const,
    }
  }
}
