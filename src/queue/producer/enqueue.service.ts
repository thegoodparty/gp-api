import { Injectable, Logger } from '@nestjs/common'
import { SQSClient, SQSClientConfig } from '@aws-sdk/client-sqs'
import { Producer } from 'sqs-producer'
import { Message } from '@ssut/nestjs-sqs/dist/sqs.types'
import { queueConfig } from '../queue.config'
import { v4 as uuidv4 } from 'uuid'
import { QueueMessage } from '../queue.types'

export enum MessageGroup {
  p2v = 'p2v',
  content = 'content',
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

// create simple producer. the producer in nest-sqs does not work.
// so we use the underlying sqs-producer package
const producer = Producer.create({
  ...queueConfig,
  sqs: new SQSClient(config),
})

@Injectable()
export class EnqueueService {
  private readonly logger = new Logger(EnqueueService.name)
  constructor() {}
  async sendMessage(
    msg: QueueMessage,
    group: MessageGroup = MessageGroup.default,
  ) {
    const body = JSON.stringify(msg)

    const id = uuidv4()

    const message: Message = {
      id,
      body,
      deduplicationId: id, // Required for FIFO queues
      groupId: `gp-queue-${group}`, // Required for FIFO queues
    }

    try {
      return await producer.send(message)
    } catch (error) {
      this.logger.error('error queueing message', error)
    }
  }
}
