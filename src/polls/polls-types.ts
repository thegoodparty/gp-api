// -- API Resources -- //
export type APIPoll = {
  id: number
  name: string
  status: 'in_progress' | 'completed'
  messageContent: string
  imageUrl?: string
  scheduledDate: string
  completedDate: string
  audienceSize: number
  lowConfidence: boolean
}

export type PollIssue = {
  pollId: string
  title: string
  summary: string
  details: string
  mentionCount: number
  representativeComments: Array<{
    comment: string
    name: string
  }>
}
