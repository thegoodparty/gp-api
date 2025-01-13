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
      isProUpdatedAt?: number // TODO: make this an ISO dateTime string
      customIssues?: Record<'title' | 'position', string>[]
      runningAgainst?: Record<'name' | 'party' | 'description', string>[]
      party?: string //TODO: enumerate all parties we want to allow?
      otherParty?: string
      office?: string
      otherOffice?: string
      website?: string
      district?: string
      pastExperience?: string
      occupation?: string
      funFact?: string
      campaignCommittee?: string
      statementName?: string
      subscriptionId?: string
      endOfElectionSubscriptionCanceled?: boolean
      subscriptionCanceledAt?: number | null
      subscriptionCancelAt?: number | null
    }

    export type CampaignData = {
      createdBy?: 'admin' | string
      launchStatus?: CampaignLaunchStatus
      currentStep?: OnboardingStep
      slug?: string
      lastVisited?: number
    }

    export type CampaignAiContent = {
      generationStatus?: Record<string, AiContentGenerationStatus>
      campaignPlanAttempts?: Record<string, number>
    } & Record<string, AiContentData>
  }
}
