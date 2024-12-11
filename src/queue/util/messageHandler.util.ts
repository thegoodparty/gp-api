import { Injectable } from '@nestjs/common'
import { targetModulesByContainer } from '@nestjs/core/router/router-module'
import { SqsMessageHandler } from '@ssut/nestjs-sqs'

@Injectable()
export class MessageHandler {
  constructor() {}
  @SqsMessageHandler(process.env.SQS_QUEUE || '', false)
  async handleMessage(message: any) {
    // , ctx: any
    try {
      const date = new Date().toLocaleString('en-US', {
        timeZone: 'America/Los_Angeles',
      })
      console.log(`[${date}] Received message: ${message.Body}`)

      const obj: any = JSON.parse(message.Body) as {
        message: string
        date: string
      }
      //   const { data } = JSON.parse(obj.Message)
      //   console.log('data', data)
      console.log('obj', obj)

      //   ctx.ack()
      //return true
    } catch (error) {
      console.error('Error processing message:', error)
      // Optionally, use `ctx.nack()` to handle retries or dead-letter queue logic
    }
  }
}
