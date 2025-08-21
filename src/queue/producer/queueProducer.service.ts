import { Injectable, Logger } from '@nestjs/common'
import { SQSClient, SQSClientConfig } from '@aws-sdk/client-sqs'
import { Producer } from 'sqs-producer'
import { Message } from '@ssut/nestjs-sqs/dist/sqs.types'
import { queueConfig } from '../queue.config'

export enum MessageGroup {
  p2v = 'p2v',
  content = 'content',
  tcrCompliance = 'tcrCompliance',
  default = 'default',
}

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

console.log('process.env.AWS_ACCESS_KEY_ID', process.env.AWS_ACCESS_KEY_ID)

// create simple producer. the producer in nest-sqs does not work.
// so we use the underlying sqs-producer package
const producer = Producer.create({
  ...queueConfig,
  sqs: new SQSClient(config),
})

@Injectable()
export class QueueProducerService {
  private readonly logger = new Logger(QueueProducerService.name)
  constructor() {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async sendMessage(msg: any, group: MessageGroup = MessageGroup.default) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body: any = JSON.stringify(msg)

    const uuid = Math.random().toString(36).substring(2, 12)

    const message: Message = {
      id: uuid,
      body,
      deduplicationId: uuid, // Required for FIFO queues
      groupId: `gp-queue-${group}`, // Required for FIFO queues
    }

    try {
      await producer.send(message)
    } catch (error) {
      this.logger.error('error queueing message', error)
    }
  }
}
