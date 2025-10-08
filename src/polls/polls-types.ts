// -- API Resources -- //
export type Poll = {
  id: string
  questionContent: string
  imageUrl?: string
  startDate: string
  estimatedCompletionDate: string
  lowConfidence: boolean
  audienceSize: number
  // "in-progress" means "this poll is actively running"
  // "completed" means "it's done, there are results!
  // In the future, we'll support "scheduled" as well, but not
  // necessary for the current scope.
  status: 'in-progress' | 'completed'
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
