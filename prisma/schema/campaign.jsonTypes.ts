import { User } from '@prisma/client'
import {
  AiContentData,
  AiContentGenerationStatus,
} from 'src/campaigns/ai/content/aiContent.types'
import {
  CampaignLaunchStatus,
  ElectionLevel,
  OnboardingStep,
  VoterGoals,
} from 'src/campaigns/campaigns.types'
import { CustomVoterFile } from 'src/voters/voterFile/voterFile.types'

export {}

declare global {
  export namespace PrismaJson {
    // Take care not to duplicate a field on both details and data
    export type CampaignDetails = {
      state?: string
      ballotLevel?: string
      electionDate?: string
      primaryElectionDate?: string
      zip?: User['zip']
      knowRun?: 'yes' | null
      runForOffice?: 'yes' | 'no' | null
      pledged?: boolean
      isProUpdatedAt?: number // TODO: make this an ISO dateTime string
      customIssues?: Record<'title' | 'position', string>[]
      runningAgainst?: Record<'name' | 'party' | 'description', string>[]
      geoLocation?: {
        geoHash?: string
        lng?: number
        lat?: number
      }
      geoLocationFailed?: boolean
      city?: string | null
      county?: string | null
      normalizedOffice?: string | null
      otherOffice?: string
      office?: string
      party?: string
      otherParty?: string
      district?: string
      raceId?: string
      level?: ElectionLevel | null
      noNormalizedOffice?: boolean
      website?: string
      pastExperience?: string
      occupation?: string
      funFact?: string
      campaignCommittee?: string
      statementName?: string
      subscriptionId?: string
      endOfElectionSubscriptionCanceled?: boolean
      subscriptionCanceledAt?: number | null
      subscriptionCancelAt?: number | null
      filingPeriodsStart?: string
      filingPeriodsEnd?: string
    }
    // TODO: Reconcile these w/ CampaignDetails once front-end catches up.
    //  No reason to have both.
    //  Take care not to duplicate a field on both details and data, for now
    export type CampaignData = {
      createdBy?: 'admin' | string
      slug?: string
      hubSpotUpdates?: {
        verified_candidates?: string
        election_results?: string
        office_type?: string
      }
      currentStep?: OnboardingStep
      launchStatus?: CampaignLaunchStatus
      lastVisited?: number
      claimProfile?: string
      customVoterFiles?: CustomVoterFile[]
      reportedVoterGoals?: VoterGoals
      textCampaignCount?: number
      lastStepDate?: string
      adminUserEmail?: string
      hubspotId?: string
      name?: string
    }

    export type CampaignAiContent = {
      generationStatus?: Record<string, AiContentGenerationStatus>
      campaignPlanAttempts?: Record<string, number>
    } & Record<string, AiContentData>
  }
}
