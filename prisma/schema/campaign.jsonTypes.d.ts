import { User } from '../../src/generated/prisma'
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
      // ISO string for new writes; legacy unix-ms numbers persist in
      // existing rows until backfilled
      isProUpdatedAt?: string | number
      proUpgradeSlackNotifiedAt?: number
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
      onboarding?: OnboardingAnswers
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

    export type OnboardingBallotStatus =
      | 'on-ballot'
      | 'qualified-not-filed'
      | 'considering'
      | 'testing'

    export type OnboardingPartyAffiliation =
      | 'nonpartisan'
      | 'independent-or-non-major'
      | 'democrat'
      | 'republican'

    export type OnboardingOfficePath = 'structured' | 'manual'

    export type OnboardingSelectedOffice = {
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

    export type OnboardingManualOfficeForm = {
      office: string
      state: string
      city: string
      district: string
      officeTermLength: string
      electionDate: string
    }

    export type LocalMediaOutlet = {
      name: string
      type: 'TV' | 'print' | 'radio'
      description: string
      email?: string | null
      phone?: string | null
      address?: string | null
    }

    // Cache key is the full (state, city, office) jurisdiction that was fed
    // to the AI prompt, not just office. Without all three fields, a cache
    // entry for "City Council" in Denver would silently satisfy a fetch for
    // "City Council" in Boulder.
    export type LocalMediaOutletsCache =
      | {
          office: string
          city: string | null
          state: string
          status: 'pending'
          startedAt: number
        }
      | {
          office: string
          city: string | null
          state: string
          status: 'ready'
          outlets: LocalMediaOutlet[]
        }

    export type OnboardingAnswers = {
      officePath?: OnboardingOfficePath
      manualOffice?: boolean
      unmatchedOffice?: boolean
      ballotStatus?: OnboardingBallotStatus
      partyAffiliation?: OnboardingPartyAffiliation
      officeZip?: string
      structuredOffice?: OnboardingSelectedOffice
      manualOfficeForm?: OnboardingManualOfficeForm
      localMediaOutlets?: LocalMediaOutletsCache
    }

    export type CampaignAiContent = {
      generationStatus?: Record<string, AiContentGenerationStatus>
      campaignPlanAttempts?: Record<string, number>
    } & Record<string, AiContentData>
  }
}
