export type QueueMessage = {
  type: string
  data: unknown // any until we define the actual data structure for each message type
}

export type GenerateAiContentMessage = {
  slug: string
  key: string
  regenerate: boolean
}

export type GenerateTasksMessage = {
  campaignId: number
}
