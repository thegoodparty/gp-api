import { AIQueueMessageData } from '../campaigns/ai/content/aiContent.types'
import { PathToVictoryInput } from '../pathToVictory/types/pathToVictory.types'

export enum QUEUE_MESSAGE_TYPE {
  pathToVictory = 'pathToVictory',
  aiContentGeneration = 'generateAiContent',
  tcrComplianceSync = 'tcrComplianceSync',
}

export type QueueMessage = {
  type: QUEUE_MESSAGE_TYPE
  data: AIQueueMessageData | PathToVictoryInput // unknown // any until we define the actual data structure for each message type
}

export type GenerateAiContentMessage = {
  slug: string
  key: string
  regenerate: boolean
}
