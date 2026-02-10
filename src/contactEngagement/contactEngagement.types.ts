export enum ConstituentActivityType {
  POLL_INTERACTIONS = 'POLL_INTERACTIONS',
}

export enum ConstituentActivityEventType {
  SENT = 'SENT',
  RESPONDED = 'RESPONDED',
  OPTED_OUT = 'OPTED_OUT',
}

export type ConstituentActivityEvent = {
  type: ConstituentActivityEventType
  date: string
}

export type ConstituentActivity = {
  type: ConstituentActivityType
  date: string
  data: {
    pollId: string
    pollTitle: string
    events: ConstituentActivityEvent[]
  }
}

export type GetIndividualActivitiesResponse = {
  nextCursor: string | null
  results: ConstituentActivity[]
}

export type ConstituentIssue = {
  issueTitle: string
  issueSummary: string
  pollTitle: string
  pollId: string
  date: string
}

export type GetConstituentIssuesResponse = {
  nextCursor: string | null
  results: ConstituentIssue[]
}
