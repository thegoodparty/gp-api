import { Poll } from '@prisma/client'

export enum APIPollStatus {
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  // SCHEDULED coming in ENG-6136
}

// -- API Resources -- //
export type APIPoll = {
  id: string
  name: string
  // scheduled coming in ENG-6136
  status: APIPollStatus
  messageContent: string
  imageUrl?: string
  scheduledDate: string
  estimatedCompletionDate: string
  completedDate?: string
  audienceSize: number
  responseCount?: number
  // Will only be set if the poll is completed.
  lowConfidence?: boolean
}

export type APIPollIssue = {
  pollId: string
  title: string
  summary: string
  details: string
  mentionCount: number
  representativeComments: Array<{
    comment: string
  }>
}

export const derivePollStatus = (poll: Poll): APIPollStatus => {
  if (poll.isCompleted) {
    return APIPollStatus.COMPLETED
  }

  return APIPollStatus.IN_PROGRESS
}
