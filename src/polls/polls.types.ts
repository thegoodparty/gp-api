// -- API Resources -- //
export type APIPoll = {
  id: string
  name: string
  status: 'in_progress' | 'completed'
  messageContent: string
  imageUrl?: string
  scheduledDate: string
  estimatedCompletionDate: string
  completedDate?: string
  audienceSize: number
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
