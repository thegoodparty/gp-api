import { Injectable } from '@nestjs/common'
import { SqsMessageHandler } from '@ssut/nestjs-sqs'
import { Message } from '@aws-sdk/client-sqs'
import { QueueMessage } from './queue.types'

@Injectable()
export class ConsumerService {
  constructor() {}
  @SqsMessageHandler(process.env.SQS_QUEUE || '', false)
  async handleMessage(message: Message) {
    const shouldRequeue = await handleMessageAndMaybeRequeue(message)
    // Return a rejected promise if requeue is needed without throwing an error
    if (shouldRequeue) {
      return Promise.reject('Requeuing message without stopping the process')
    }
    return true // Return true to delete the message from the queue
  }
}

// Function to process message and decide if requeue is necessary
async function handleMessageAndMaybeRequeue(
  message: Message,
): Promise<boolean> {
  try {
    await handleMessage(message) // Your main processing logic
    return false // No requeue needed
  } catch (error) {
    console.error('Message processing failed, will requeue:', error)
    return true // Indicate that we should requeue
  }
}

async function handleMessage(message: Message) {
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
      console.log('received generateAiContent message')
      // we will call the ai service here
      //   await handleGenerateAiContent(queueMessage.data)
      break
    case 'pathToVictory':
      console.log('received pathToVictory message')
      // we will call the path to victory service here
      //   await handlePathToVictoryMessage(queueMessage.data)
      break
  }
}
