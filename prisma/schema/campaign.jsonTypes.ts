import { User } from '@prisma/client'
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
      raceId?: string
      noNormalizedOffice?: boolean
    }
    export type CampaignData = {
      createdBy?: 'admin' | string
      hubSpotUpdates?: {
        verified_candidates?: string
        election_results?: string
        office_type?: string
      }
      slug?: string | null
      currentStep?: OnboardingStep
      launchStatus?: CampaignLaunchStatus
    }
  }
}
