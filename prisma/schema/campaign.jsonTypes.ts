import { User } from '@prisma/client'
import {
  AiContentGenerationStatus,
  AiContentData,
} from 'src/campaigns/ai/content/aiContent.types'
import {
  CampaignLaunchStatus,
  OnboardingStep,
} from 'src/campaigns/campaigns.types'

export {}

declare global {
  export namespace PrismaJson {
    export type CampaignDetails = {
      state?: string
      ballotLevel?: string
      electionDate?: string
      primaryElectionDate?: string
      zip?: User['zip']
      knowRun?: 'yes' | null
      pledged?: boolean
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
      noNormalizedOffice?: boolean
      website?: string
      pastExperience?: string
      occupation?: string
      funFact?: string
      campaignCommittee?: string
      statementName?: string
    }
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
    }

    export type CampaignAiContent = {
      generationStatus?: Record<string, AiContentGenerationStatus>
      campaignPlanAttempts?: Record<string, number>
    } & Record<string, AiContentData>
  }
}
