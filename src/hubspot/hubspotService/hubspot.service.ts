import { Injectable } from '@nestjs/common'
import hubspot from '@hubspot/api-client'
import { SimplePublicObjectInput } from '@hubspot/api-client/lib/codegen/crm/companies'
import { Campaign, User } from '@prisma/client'
import { AiChatService } from '../../campaigns/ai/chat/aiChat.service'
import { PathToVictoryService } from '../../campaigns/services/path-to-victory.service/pathToVictory.service'
import { CampaignUpdateHistoryService } from '../../campaigns/updateHistory/campaignUpdateHistory.service'
import { UsersService } from '../../users/users.service'
import { getUserFullName } from '../../users/util/users.util'
import { formatDateForCRM, getCrmP2VValues } from '../util/cms.util'
import { VoterFileService } from '../../voters/voterFile/voterFile.service'
import { getStateNameByStateCode } from 'us-state-codes'

const { HUBSPOT_TOKEN } = process.env

@Injectable()
export class HubspotService {
  private client = new hubspot.Client({ accessToken: HUBSPOT_TOKEN })

  constructor(
    private readonly aiChat: AiChatService,
    private readonly pathToVictory: PathToVictoryService,
    private readonly campaignUpdateHistory: CampaignUpdateHistoryService,
    private readonly voterFile: VoterFileService,
    private readonly users: UsersService,
  ) {}

  async updateCompany(hubspotId: string, companyObj: SimplePublicObjectInput) {
    return this.client.crm.companies.basicApi.update(hubspotId, companyObj)
  }

  async createCompany(companyObj: SimplePublicObjectInput) {
    return this.client.crm.companies.basicApi.create(companyObj)
  }

  async calculateHubSpotProperties(campaign: Campaign) {
    const {
      data: campaignData,
      aiContent,
      details: campaignDetails,
      isActive,
      isPro,
      userId,
      id: campaignId,
    } = campaign || {}
    const user = (await this.users.findByCampaign(campaign)) || {}
    const aiChatCount = userId ? await this.aiChat.count(userId) : 0
    const pathToVictory = await this.pathToVictory.findUnique({
      where: { campaignId: campaignId },
    })
    const p2vData = pathToVictory!.data

    const updateHistoryCount = await this.campaignUpdateHistory.count({
      where: {
        campaignId,
      },
    })

    const {
      p2vStatus,
      p2vCompleteDate,
      winNumber,
      p2vNotNeeded,
      totalRegisteredVoters,
      viability: { candidates, isIncumbent, seats, score, isPartisan } = {},
    } = p2vData || {}

    const {
      lastStepDate,
      currentStep,
      reportedVoterGoals,
      createdBy,
      adminUserEmail,
    } = campaignData || {}

    const {
      zip,
      party,
      office,
      ballotLevel,
      level,
      state,
      pledged,
      campaignCommittee,
      otherOffice,
      district,
      city,
      website,
      runForOffice,
      electionDate,
      primaryElectionDate,
      filingPeriodsStart,
      filingPeriodsEnd,
      isProUpdatedAt,
    } = campaignDetails || {}

    const canDownloadVoterFile = this.voterFile.canDownload({
      ...campaign,
      pathToVictory,
    })

    const name = getUserFullName(user as User)

    const electionDateMs = formatDateForCRM(electionDate)
    const primaryElectionDateMs = formatDateForCRM(primaryElectionDate)
    const isProUpdatedAtMs = formatDateForCRM(isProUpdatedAt)
    const p2vCompleteDateMs = formatDateForCRM(p2vCompleteDate)
    const filingStartMs = formatDateForCRM(filingPeriodsStart)
    const filingEndMs = formatDateForCRM(filingPeriodsEnd)

    const resolvedOffice = office === 'Other' ? otherOffice : office

    const longState = getStateNameByStateCode(state)

    const proSubscriptionStatus = true // getProSubscriptionStatus(campaign)

    const p2v_status =
      p2vNotNeeded || !p2vStatus
        ? 'Locked'
        : totalRegisteredVoters
          ? 'Complete'
          : p2vStatus

    let properties: Partial<Record<string, string>> = {
      name,
      candidate_party: party,
      candidate_office: resolvedOffice,
      state: longState,
      candidate_state: longState,
      candidate_district: district,
      logged_campaign_tracker_events: `${updateHistoryCount}`,
      voter_files_created: `${
        (campaignData?.customVoterFiles &&
          campaignData?.customVoterFiles.length) ||
        0
      }`,
      sms_campaigns_requested: `${campaignData?.textCampaignCount || 0}`,
      campaign_assistant_chats: `${aiChatCount || 0}`,
      pro_subscription_status: `${proSubscriptionStatus}`,
      ...(city ? { city } : {}),
      type: 'CAMPAIGN',
      last_step: isActive ? 'onboarding-complete' : currentStep,
      last_step_date: lastStepDate || undefined,
      ...(zip ? { zip } : {}),
      pledge_status: pledged ? 'yes' : 'no',
      is_active: `${!!name}`,
      live_candidate: `${isActive}`,
      p2v_complete_date: p2vCompleteDateMs,
      p2v_status,
      election_date: electionDateMs,
      primary_date: primaryElectionDateMs,
      doors_knocked: `${reportedVoterGoals?.doorKnocking || 0}`,
      direct_mail_sent: `${reportedVoterGoals?.directMail || 0}`,
      calls_made: `${reportedVoterGoals?.calls || 0}`,
      online_impressions: `${reportedVoterGoals?.digitalAds || 0}`,
      p2p_sent: `${reportedVoterGoals?.text || 0}`,
      event_impressions: `${reportedVoterGoals?.events || 0}`,
      yard_signs_impressions: `${reportedVoterGoals?.yardSigns || 0}`,
      my_content_pieces_created: `${aiContent ? Object.keys(aiContent).length : 0}`,
      filed_candidate: campaignCommittee ? 'yes' : 'no',
      pro_candidate: isPro ? 'Yes' : 'No',
      pro_upgrade_date: isProUpdatedAtMs,
      filing_start: filingStartMs,
      filing_end: filingEndMs,
      ...(website ? { website } : {}),
      ...(level ? { ai_office_level: level } : {}),
      ...(ballotLevel ? { office_level: ballotLevel } : {}),
      ...(runForOffice ? { running: runForOffice ? 'yes' : 'no' } : {}),
      ...getCrmP2VValues(p2vData),
      win_number: `${winNumber}`,
      voter_data_adoption: canDownloadVoterFile ? 'Unlocked' : 'Locked',
      created_by_admin: createdBy === 'admin' ? 'yes' : 'no',
      admin_user: adminUserEmail ?? '',
      ...(candidates && typeof candidates === 'number' && candidates > 0
        ? { opponents: `${candidates - 1}` }
        : {}),
      ...(typeof isIncumbent === 'boolean'
        ? { incumbent: isIncumbent ? 'Yes' : 'No' }
        : {}),
      ...(seats && typeof seats === 'number' && seats > 0
        ? { seats_available: `${seats}` }
        : {}),
      ...(score && typeof score === 'number' && score > 0
        ? { automated_score: `${Math.floor(score > 5 ? 5 : score)}` }
        : {}),
      ...(typeof isPartisan === 'boolean'
        ? { partisan_np: isPartisan ? 'Partisan' : 'Nonpartisan' }
        : {}),
    }

    delete properties.winnumber
    delete properties.p2vStatus
    delete properties.p2vstatus
    delete properties.p2vCompleteDate
    delete properties.p2vcompletedate

    return properties
  }
}
