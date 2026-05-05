import { User } from '@prisma/client'
import {
  AiContentData,
  AiContentGenerationStatus,
} from 'src/campaigns/ai/content/aiContent.types'
import {
  BallotReadyPositionLevel,
  CampaignCreatedBy,
  CampaignLaunchStatus,
  ElectionLevel,
  OnboardingStep,
  VoterGoals,
} from '@goodparty_org/contracts'
import { HubSpot } from 'src/crm/crm.types'
import { CustomVoterFile } from 'src/voters/voterFile/voterFile.types'

export {}

declare global {
  export namespace PrismaJson {
    // Take care not to duplicate a field on both details and data
    export type CampaignDetails = {
      state?: string
      ballotLevel?: BallotReadyPositionLevel
      electionDate?: string
      primaryElectionDate?: string
      zip?: User['zip']
      knowRun?: 'yes' | null
      runForOffice?: 'yes' | 'no' | null
      ballotStatus?:
        | 'on-ballot'
        | 'qualified-not-filed'
        | 'considering'
        | 'testing'
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
      party?: string
      otherParty?: string
      district?: string
      raceId?: string | null
      level?: ElectionLevel | null
      noNormalizedOffice?: boolean
      website?: string
      pastExperience?: string | Record<string, string>
      occupation?: string
      funFact?: string
      campaignCommittee?: string
      statementName?: string
      subscriptionId?: string | null
      endOfElectionSubscriptionCanceled?: boolean
      subscriptionCanceledAt?: number | null
      subscriptionCancelAt?: number | null
      filingPeriodsStart?: string | null
      filingPeriodsEnd?: string | null
      officeTermLength?: string
      partisanType?: string | null
      priorElectionDates?: string[]
      electionId?: string | null
      tier?: string
      einNumber?: string | null
      einSupportingDocument?: string | null
      wonGeneral?: boolean
    }
    // TODO: Reconcile these w/ CampaignDetails once front-end catches up.
    //  No reason to have both.
    //  Take care not to duplicate a field on both details and data, for now.
    export type CampaignData = {
      createdBy?: CampaignCreatedBy
      slug?: string
      hubSpotUpdates?: Partial<Record<HubSpot.IncomingProperty, string>>
      currentStep?: OnboardingStep
      onboarding?: NewOnboardingAnswers
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

    export type NewOnboardingBallotStatus =
      | 'on-ballot'
      | 'qualified-not-filed'
      | 'considering'
      | 'testing'

    export type NewOnboardingPartyAffiliation =
      | 'nonpartisan'
      | 'independent-or-non-major'
      | 'democrat'
      | 'republican'

    export type NewOnboardingOfficePath = 'structured' | 'manual'

    export type NewOnboardingSelectedOffice = {
      raceId: string
      positionId?: string
      positionName: string
      level?: string
      city?: string
      electionDay?: string
      electionId?: string
      state?: string
      partisanType?: string
      hasPrimary?: boolean
      primaryElectionDate?: string
      primaryElectionId?: string
      officeTermLength?: string
      filingPeriodsStart?: string
      filingPeriodsEnd?: string
    }

    export type NewOnboardingManualOfficeForm = {
      office: string
      state: string
      city: string
      district: string
      officeTermLength: string
      electionDate: string
    }

    export type NewOnboardingAnswers = {
      officePath?: NewOnboardingOfficePath
      manualOffice?: boolean
      unmatchedOffice?: boolean
      ballotStatus?: NewOnboardingBallotStatus
      partyAffiliation?: NewOnboardingPartyAffiliation
      officeZip?: string
      structuredOffice?: NewOnboardingSelectedOffice
      manualOfficeForm?: NewOnboardingManualOfficeForm
    }

    export type CampaignAiContent = {
      generationStatus?: Record<string, AiContentGenerationStatus>
      campaignPlanAttempts?: Record<string, number>
    } & Record<string, AiContentData>
  }
}
