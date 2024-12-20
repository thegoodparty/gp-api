import { Injectable, Logger } from '@nestjs/common'
import { SqsMessageHandler } from '@ssut/nestjs-sqs'
import { Message } from '@aws-sdk/client-sqs'
import { QueueMessage } from './queue.types'

@Injectable()
export class ConsumerService {
  private readonly logger = new Logger(ConsumerService.name)
  constructor() {}
  @SqsMessageHandler(process.env.SQS_QUEUE || '', false)
  async handleMessage(message: Message) {
    const shouldRequeue = await this.handleMessageAndMaybeRequeue(message)
    // Return a rejected promise if requeue is needed without throwing an error
    if (shouldRequeue) {
      return Promise.reject('Requeuing message without stopping the process')
    }
    return true // Return true to delete the message from the queue
  }

  // Function to process message and decide if requeue is necessary
  async handleMessageAndMaybeRequeue(message: Message): Promise<boolean> {
    try {
      await this.processMessage(message)
      return false // No requeue needed
    } catch (error) {
      this.logger.error('Message processing failed, will requeue:', error)
      return true // Indicate that we should requeue
    }
  }

  async processMessage(message: Message) {
    // console.log(`consumer received message: ${message.Body}`);
    if (!message) {
      return
    }
    const body = message.Body
    if (!body) {
      return
    }
    const queueMessage: QueueMessage = JSON.parse(body)

    console.log('processing queue message type ', queueMessage.type)

    switch (queueMessage.type) {
      case 'generateAiContent':
        this.logger.log('received generateAiContent message')
        //   await handleGenerateAiContent(queueMessage.data)
        break
      case 'pathToVictory':
        this.logger.log('received pathToVictory message')
        //   await handlePathToVictoryMessage(queueMessage.data)
        break
    }
  }
}
