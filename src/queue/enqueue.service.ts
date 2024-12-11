import { Injectable } from '@nestjs/common'
import { SqsService } from '@ssut/nestjs-sqs'
import { SQSClient, SQSClientConfig } from '@aws-sdk/client-sqs'
import { Producer } from 'sqs-producer'
import { Message } from '@ssut/nestjs-sqs/dist/sqs.types'

@Injectable()
export class EnqueueService {
  constructor(private readonly sqsService: SqsService) {}
  async sendMessage(msg: any) {
    const body: any = JSON.stringify(msg)

    const config: SQSClientConfig = {
      region: process.env.AWS_REGION || '',
    }

    if (process.env.NODE_ENV !== 'production') {
      if (
        !process.env.AWS_ACCESS_KEY_ID ||
        !process.env.AWS_SECRET_ACCESS_KEY
      ) {
        throw new Error(
          'AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are required in development mode',
        )
      }
      config.credentials = {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
      }
    }

    // create simple producer
    const producer = Producer.create({
      queueUrl: process.env.SQS_QUEUE_URL || '',
      region: process.env.AWS_REGION || '',
      sqs: new SQSClient(config),
    })

    const uuid = Math.random().toString(36).substring(2, 12)

    const message: Message = {
      id: uuid,
      body,
      deduplicationId: uuid, // Required for FIFO queues
      groupId: 'gp-queue', // Required for FIFO queues
    }

    let resp
    try {
      //await this.sqsService.send(process.env.SQS_QUEUE_URL || '', message)
      resp = await producer.send(message)
    } catch (error) {
      console.log('error queueing message', error)
    }

    console.log('resp', resp)
  }
}
