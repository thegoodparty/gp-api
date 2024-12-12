import { Injectable } from '@nestjs/common'
import { SqsMessageHandler } from '@ssut/nestjs-sqs'

@Injectable()
export class MessageHandler {
  constructor() {}
  @SqsMessageHandler(process.env.SQS_QUEUE || '', false)
  async handleMessage(message: any) {
    try {
      const date = new Date().toLocaleString('en-US', {
        timeZone: 'America/Los_Angeles',
      })
      console.log(`[${date}] Received message: ${message.Body}`)

      const shouldRequeue = await handleMessageAndMaybeRequeue(message)
      // Return a rejected promise if requeue is needed without throwing an error
      if (shouldRequeue) {
        return Promise.reject('Requeuing message without stopping the process')
      }
    } catch (error) {
      console.error('Error processing message:', error)
    }
    return true // Return true to delete the message from the queue
  }
}

// Function to process message and decide if requeue is necessary
async function handleMessageAndMaybeRequeue(message: any): Promise<boolean> {
  try {
    await handleMessage(message) // Your main processing logic
    return false // No requeue needed
  } catch (error) {
    console.error('Message processing failed, will requeue:', error)
    return true // Indicate that we should requeue
  }
}

async function handleMessage(message) {
  // console.log(`consumer received message: ${message.Body}`);
  if (!message) {
    return
  }
  const body = message.Body
  if (!body) {
    return
  }
  const action = JSON.parse(body)
  const { type, data } = action
  console.log('processing queue message type ', type)

  switch (type) {
    case 'generateAiContent':
      console.log('received generateAiContent message')
      // we will call the ai service here?
      //   await handleGenerateAiContent(data)
      break
    case 'pathToVictory':
      console.log('received pathToVictory message')
      // we will call the path to victory service here?
      //   await handlePathToVictoryMessage(data)
      break
    case 'calculateGeoLocation':
      //   await sails.helpers.geocoding.calculateGeoLocation()
      break
    case 'calculateDkRoutes':
      //   await sails.helpers.geocoding.calculateRoutes(
      //     data.campaignId,
      //     data.dkCampaignId,
      //     data.maxHousesPerRoute,
      //   )
      break
  }
}
