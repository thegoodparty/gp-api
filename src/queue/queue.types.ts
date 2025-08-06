export type QueueMessage = {
  type: string
  data: unknown // any until we define the actual data structure for each message type
}

export type GenerateAiContentMessage = {
  slug: string
  key: string
  regenerate: boolean
}

export type PeerlyPhoneListPollingMessage = {
  listToken: string
  campaignId: string
  jobName: string
  messageTemplates: Array<{
    title: string
    text: string
    mediaStream?: {
      stream: string // Base64 encoded stream for queue serialization
      fileName: string
      mimeType: string
      fileSize?: number
    }
  }>
  didState: string
  identityId?: string
  attempt: number
  maxAttempts: number
  delayMs: number
}
