import { BadGatewayException, Injectable } from '@nestjs/common'
import { Methods, MimeTypes } from 'http-constants-ts'
import { createHash } from 'crypto'
import {
  SQSClient,
  SQSClientConfig,
  SendMessageCommand,
} from '@aws-sdk/client-sqs'
import { Producer } from 'sqs-producer'
import { Message } from '@ssut/nestjs-sqs/dist/sqs.types'
import { campaignPlanQueueConfig, queueConfig } from '../queue.config'
import { MessageGroup, QueueMessage } from '../queue.types'
import { PinoLogger } from 'nestjs-pino'

const config: SQSClientConfig = {
  region: process.env.AWS_REGION || '',
}

if (process.env.NODE_ENV !== 'production') {
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    throw new Error(
      'AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are required in development mode',
    )
  }
  config.credentials = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  }
}

const sqsClient = new SQSClient(config)

// create simple producer. the producer in nest-sqs does not work.
// so we use the underlying sqs-producer package
const producer = Producer.create({
  ...queueConfig,
  sqs: sqsClient,
})

@Injectable()
export class QueueProducerService {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(QueueProducerService.name)
  }
  async sendMessage(
    msg: QueueMessage,
    group: MessageGroup | string = MessageGroup.default,
    options: { throwOnError?: boolean; deduplicationId?: string } = {},
  ) {
    const body = JSON.stringify(msg)

    const uuid = Math.random().toString(36).substring(2, 12)
    const deduplicationId = options.deduplicationId ?? uuid

    const message: Message = {
      id: uuid,
      body,
      deduplicationId,
      groupId: `gp-queue-${group}`,
    }

    try {
      await producer.send(message)
    } catch (error) {
      this.logger.error({ error }, 'error queueing message')
      if (options.throwOnError) {
        throw error
      }
    }
  }

  async sendToExternalQueue<T extends object>(
    queueUrl: string,
    body: T,
    messageGroupId: string,
  ): Promise<void> {
    const messageBody = JSON.stringify(body)
    const bodyHash = createHash('sha256')
      .update(messageBody)
      .digest('hex')
      .substring(0, 16)
    const deduplicationId = `${messageGroupId}-${bodyHash}`
    try {
      await sqsClient.send(
        new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: messageBody,
          MessageGroupId: messageGroupId,
          MessageDeduplicationId: deduplicationId,
        }),
      )
    } catch (error) {
      this.logger.error({ error, queueUrl }, 'error sending to external queue')
      throw error
    }
  }

  async sendToCampaignPlanQueue(body: {
    campaignId: number
    electionDate: string
    state: string | null
    city: string | null
    officeName: string | null
    officeLevel: string | null
    primaryElectionDate: string | null
  }): Promise<void> {
    const { localUrl, inputQueueUrl } = campaignPlanQueueConfig

    // Local development/testing bypass — POST directly instead of SQS.
    if (localUrl && process.env.NODE_ENV !== 'production') {
      const response = await fetch(localUrl, {
        method: Methods.POST,
        headers: { 'Content-Type': MimeTypes.APPLICATION_JSON },
        body: JSON.stringify(body),
      })
      if (!response.ok) {
        throw new BadGatewayException(
          `Local campaign plan server returned ${response.status}`,
        )
      }
      return
    }

    if (!inputQueueUrl) {
      throw new BadGatewayException(
        'Campaign plan input queue URL not configured',
      )
    }

    await this.sendToExternalQueue(
      inputQueueUrl,
      body,
      `campaign-plan-${body.campaignId}`,
    )
  }
}
