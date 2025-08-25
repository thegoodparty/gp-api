export enum QueueType {
  GENERATE_AI_CONTENT = 'generateAiContent',
  PATH_TO_VICTORY = 'pathToVictory',
  TCR_COMPLIANCE_STATUS_CHECK = 'tcrComplianceStatusCheck',
  GENERATE_TASKS = 'generateTasks',
}

export type QueueMessage = {
  type: QueueType
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  data: unknown // any until we define the actual data structure for each message type
}

export type GenerateAiContentMessageData = {
  slug: string
  key: string
  regenerate: boolean
}

export type TcrComplianceStatusCheckMessage = {
  peerlyIdentityId: string
  processTime: string // ISO 8601 date time string format
}

export type GenerateTasksMessage = {
  campaignId: number
}
