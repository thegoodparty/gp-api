export interface FullStoryUserResponse {
  data: {
    results: {
      id: string
    }[]
  }
}

export type SyncTrackingResultCounts = {
  updated: number
  skipped: number
  failed: number
}

export interface TrackingProperties {
  slug?: string
  isActive?: boolean | null
  electionDate?: string | Date
  primaryElectionDate?: string | Date
  primaryElectionResult?: string
  electionResults?: string
  level?: string
  state?: string
  pledged?: boolean
  party?: string
  currentStep?: string
  isVerified?: boolean | null
  isPro?: boolean | null
  aiContentCount?: number
  p2vStatus?: string
  electionDateStr?: string
  primaryElectionDateStr?: string
  filingPeriodsStartMonth?: string
  filingPeriodsEndMonth?: string
  callsMade?: number
  onlineImpressions?: number
  directMail?: number
  digitalAds?: number
  smsSent?: number
  events?: number
  reportedVoterGoalsTotalCount?: number
  voterContactGoal?: string | number
  hubSpotUpdates?: Record<string, any>
  aiContentTrackingFlags?: Record<string, any>
}
