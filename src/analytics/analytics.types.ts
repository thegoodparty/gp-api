import { VoterGoals } from 'src/campaigns/campaigns.types'
import { SegmentProperties } from 'src/segment/segment.types'

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
  sessionCount?: number
  createdByAdmin?: boolean
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
  reportedVoterGoals?: VoterGoals
  reportedVoterGoalsTotalCount?: number
  voterContactGoal?: string | number
  voterContactPercentage?: number | string
  hubSpotUpdates?: Record<string, any>
  aiContentTrackingFlags?: Record<string, any>
  contentQuestionsAnswered?: number
}

export type FullStoryAndSegmentProperties = Partial<
  TrackingProperties & SegmentProperties
>
