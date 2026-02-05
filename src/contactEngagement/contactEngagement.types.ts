export enum ConstituentActivityType {
  POLL_INTERACTIONS,
}

export enum ConstituentActivityEventType {
  SENT,
  RESPONDED,
  OPTED_OUT,
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
