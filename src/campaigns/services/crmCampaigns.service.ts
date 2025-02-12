import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common'
import usStates from 'states-us'
import { CRMCompanyProperties } from '../../crm/crm.types'
import {
  SimplePublicObject,
  SimplePublicObjectInputForCreate,
} from '@hubspot/api-client/lib/codegen/crm/deals'
import {
  ApiException,
  SimplePublicObjectBatchInput,
  SimplePublicObjectInput,
} from '@hubspot/api-client/lib/codegen/crm/companies'
import { HubspotService } from '../../crm/hubspot.service'
import { CampaignsService } from './campaigns.service'
import { SlackService } from '../../shared/services/slack.service'
import { Campaign, Prisma, User } from '@prisma/client'
import { getUserFullName } from '../../users/util/users.util'
import { formatDateForCRM, getCrmP2VValues } from '../../crm/util/cms.util'
import { CrmUsersService } from '../../users/services/crmUsers.service'
import { UsersService } from '../../users/services/users.service'
import { AssociationSpecAssociationCategoryEnum } from '@hubspot/api-client/lib/codegen/crm/associations/v4/models/AssociationSpec'
import { AssociationTypes } from '@hubspot/api-client'
import { AiChatService } from '../ai/chat/aiChat.service'
import { PathToVictoryService } from './pathToVictory.service'
import { CampaignUpdateHistoryService } from '../updateHistory/campaignUpdateHistory.service'
import { IS_PROD } from '../../shared/util/appEnvironment.util'
import { FullStoryService } from '../../fullStory/fullStory.service'
import { pick } from '../../shared/util/objects.util'
import { SlackChannel } from '../../shared/services/slackService.types'
import { VoterFileDownloadAccessService } from '../../shared/services/voterFileDownloadAccess.service'

export const HUBSPOT_COMPANY_PROPERTIES = [
  'past_candidate',
  'incumbent',
  'candidate_experience_level',
  'final_viability_rating',
  'primary_election_result',
  'election_results',
  'professional_experience',
  'p2p_campaigns',
  'p2p_sent',
  'confirmed_self_filer',
  'verified_candidates',
  'date_verified',
  'pro_candidate',
  'filing_deadline',
  'opponents',
  'hubspot_owner_id',
  'office_type',
]

/// map of emails to slack ids for mentioning users
const EMAIL_TO_SLACK_ID = {
  'sanjeev@goodparty.org': 'U07GUGCQ88M',
  // PA emails
  'jared@goodparty.org': 'U01AY0VQFPE',
  'ryan@goodparty.org': 'U06T7RGGHEZ',
  'kyron.banks@goodparty.org': 'U07JWLYDDUH',
  'alex.barrio@goodparty.org': 'U0748BRPPJQ',
  'trey.stradling@goodparty.org': 'U06FPEP4QBZ',
  'alex.gibson@goodparty.org': 'U079ASLQ9G8',
  'dllane2012@gmail.com': 'U06U033GHDE',
  'aaron.soriano@goodparty.org': 'U07QXHVNDEJ',
  'nate.allen@goodparty.org': 'U07R9RNFTFX',
}

@Injectable()
export class CrmCampaignsService {
  private readonly logger = new Logger(this.constructor.name)
  constructor(
    @Inject(forwardRef(() => CampaignsService))
    private readonly campaigns: CampaignsService,
    @Inject(forwardRef(() => UsersService))
    private readonly users: UsersService,
    @Inject(forwardRef(() => FullStoryService))
    private readonly fullStory: FullStoryService,
    private readonly hubspot: HubspotService,
    private readonly crmUsers: CrmUsersService,
    private readonly aiChat: AiChatService,
    private readonly pathToVictory: PathToVictoryService,
    private readonly campaignUpdateHistory: CampaignUpdateHistoryService,
    private readonly voterFile: VoterFileDownloadAccessService,
    private readonly slack: SlackService,
  ) {}

  async getCrmCompanyById(hubspotId: string) {
    return await this.hubspot.client.crm.companies.basicApi.getById(
      hubspotId,
      HUBSPOT_COMPANY_PROPERTIES,
    )
  }

  private async getCompanyOwner(companyOwnerId: number) {
    try {
      return await this.hubspot.client.crm.owners.ownersApi.getById(
        companyOwnerId,
      )
    } catch (error) {
      const message = 'hubspot error - get-company-owner'
      this.logger.error(message, error)
      this.slack.errorMessage({
        message,
        error,
      })
    }
  }

  async getCrmCompanyOwnerName(crmCompanyId: string) {
    const crmCompany = await this.getCrmCompanyById(crmCompanyId)
    if (!crmCompany?.properties) {
      this.logger.error('no properties found for crm company')
      return
    }
    let crmCompanyOwnerName = ''
    try {
      const crmCompanyOwner = await this.getCompanyOwner(
        parseInt(crmCompany?.properties?.hubspot_owner_id as string),
      )
      const { firstName, lastName, email } = crmCompanyOwner || {}
      crmCompanyOwnerName = `${firstName ? `${firstName} ` : ''}${
        lastName ? lastName : ''
      } - <@${
        EMAIL_TO_SLACK_ID[IS_PROD && email ? email : 'jared@goodparty.org']
      }>`
    } catch (e) {
      this.logger.error('error getting crm company owner', e)
    }
    return crmCompanyOwnerName
  }

  private async createCompany(companyObj: CRMCompanyProperties) {
    let crmCompany: SimplePublicObject | null = null
    try {
      crmCompany = await this.hubspot.client.crm.companies.basicApi.create(
        companyObj as SimplePublicObjectInputForCreate,
      )
    } catch (error) {
      this.logger.error('error creating company', error)
      this.slack.errorMessage({
        message: `Error creating company for ${companyObj.name} in hubspot`,
        error,
      })
    }

    if (!crmCompany) {
      this.slack.errorMessage({
        message: `Error creating company for ${companyObj.name} in hubspot. No response from hubspot.`,
      })
      return
    }

    return crmCompany
  }

  private async updateCrmCompany(
    hubspotId: string,
    crmCompanyProperties: CRMCompanyProperties,
  ) {
    let crmCompany: SimplePublicObject
    try {
      crmCompany = await this.hubspot.client.crm.companies.basicApi.update(
        hubspotId,
        crmCompanyProperties as SimplePublicObjectInput,
      )
    } catch (e) {
      const { name } = crmCompanyProperties
      this.logger.error('error updating crm', e)
      if (e instanceof ApiException && e.code === 404) {
        this.slack.errorMessage({
          message: `Could not find hubspot company for ${name} with hubspotId ${hubspotId}`,
          error: e,
        })
        const campaign = await this.campaigns.findFirst({
          where: {
            data: {
              path: ['hubspotId'],
              equals: hubspotId,
            },
          },
        })
        campaign &&
          (await this.campaigns.updateJsonFields(campaign.id, {
            data: {
              hubspotId: null,
            },
          }))
      } else {
        this.slack.errorMessage({
          message: `Error updating company for ${name} with existing hubspotId: ${hubspotId} in hubspot`,
        })
      }
      return
    }
    return crmCompany
  }

  private async calculateCRMCompanyProperties(campaign: Campaign) {
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
    const aiChatCount = userId
      ? await this.aiChat.count({ where: { id: userId } })
      : 0
    const pathToVictory = await this.pathToVictory.findFirst({
      where: { campaignId: campaignId },
    })
    const p2vData = pathToVictory?.data

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

    const longState = usStates.find(
      (usState) => usState.abbreviation === state?.toUpperCase(),
    )?.name

    const proSubscriptionStatus = true

    const p2v_status =
      p2vNotNeeded || !p2vStatus
        ? 'Locked'
        : totalRegisteredVoters
          ? 'Complete'
          : p2vStatus

    const properties: CRMCompanyProperties = {
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
      running: runForOffice ? 'yes' : 'no',
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
      ...(typeof score === 'number' && score > 0
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

  private async associateCompanyWithContact(
    crmContactId?: string,
    crmCompanyId?: string,
  ) {
    if (!crmContactId) {
      // this should not happen since the contact id should have been created
      this.logger.error('no CRM contact id given')
      return
    }
    if (!crmCompanyId) {
      this.logger.error('no CRM company id given')
      return
    }

    try {
      await this.hubspot.client.crm.associations.v4.batchApi.create(
        'contact',
        'company',
        {
          inputs: [
            {
              _from: { id: crmCompanyId },
              to: { id: crmContactId },
              types: [
                {
                  associationCategory:
                    AssociationSpecAssociationCategoryEnum.HubspotDefined,
                  associationTypeId: AssociationTypes.primaryCompanyToContact,
                },
              ],
            },
          ],
        },
      )
    } catch (error) {
      this.logger.error({
        message: `failure to associate company to contact w/ ids, respectively: ${crmCompanyId} and ${crmContactId}`,
        error,
      })
    }
  }

  async trackCampaign(campaignId: number) {
    const campaign = await this.campaigns.findFirst({
      where: { id: campaignId },
    })
    if (!campaign) {
      throw new Error(`No campaign found for given id: ${campaignId}`)
    }

    const { data: campaignData, userId } = campaign
    const { hubspotId: existingHubspotId } = campaignData

    const crmCompanyProperties =
      await this.calculateCRMCompanyProperties(campaign)

    let crmCompany: SimplePublicObject | undefined
    if (existingHubspotId) {
      crmCompany = await this.updateCrmCompany(
        existingHubspotId,
        crmCompanyProperties,
      )

      return existingHubspotId
    } else {
      crmCompany = await this.createCompany(crmCompanyProperties)
    }

    if (!crmCompany) {
      return //no throw or error here to keep execution from stopping
    }

    const user = await this.users.findByCampaign(campaign)
    if (!user) {
      const message = `No user found for campaign ${campaignId}`
      this.logger.error(message)
      this.slack.errorMessage({
        message,
      })
      return
    }

    const { metaData } = user
    let { hubspotId: crmContactId } = metaData || {}

    if (!crmContactId) {
      const message = `No hubspot id found for user ${userId}`
      this.logger.error(message)
      this.slack.errorMessage({
        message,
      })
      try {
        const crmContact = await this.crmUsers.trackUserUpdate(campaign.userId)
        crmContactId = crmContact?.id
      } catch (error) {
        this.logger.error(
          `Error tracking user for campaign ${campaignId} in hubspot`,
          error,
        )
        return
      }
    }

    const crmCompanyId = crmCompany.id

    // make sure we refresh campaign object so we have hubspotId.
    await this.campaigns.update({
      where: { id: campaignId },
      data: {
        data: {
          ...campaignData,
          hubspotId: crmCompanyId,
          name: crmCompanyProperties.name,
        },
      },
    })

    // associate the Contact with the Company in Hubspot
    try {
      this.associateCompanyWithContact(crmContactId, crmCompanyId)
    } catch (e) {
      const message = `Error associating user ${userId}. hubspot id: ${crmContactId} to campaign ${campaign.id} in hubspot`
      this.logger.error(message, e)
      await this.slack.errorMessage({
        message,
        error: e,
      })
    }

    return crmCompanyId
  }

  async handleUpdateViability(
    campaign: Campaign,
    propertyName: string,
    propertyValue: string | boolean | number,
  ) {
    if (propertyName === 'incumbent') {
      if (propertyValue === 'Yes') {
        propertyName = 'isIncumbent'
        propertyValue = true
      } else {
        propertyName = 'isIncumbent'
        propertyValue = false
      }
    }
    if (propertyName === 'opponents') {
      propertyName = 'opponents'
      propertyValue = parseInt(propertyValue as string)
    }

    const campaignId = campaign.id

    try {
      const { id: p2vId, data: { viability, ...restData } = {} } =
        (await this.pathToVictory.findFirst({
          where: { campaignId },
        })) || {}
      this.pathToVictory.model.update({
        where: { id: p2vId },
        data: {
          data: {
            ...restData,
            viability: {
              ...viability,
              [propertyName]: propertyValue,
            },
          },
        },
      })
    } catch (e) {
      const message = 'error at update viability'
      this.logger.error(message, e)
      this.slack.errorMessage({
        message,
        error: e,
      })
    }
  }

  async handleUpdateCampaign(
    campaign: Campaign,
    propertyName: string,
    propertyValue: string | boolean | number,
  ) {
    const hubSpotUpdates = campaign.data.hubSpotUpdates
      ? {
          hubSpotUpdates: campaign.data.hubSpotUpdates,
          [propertyName]: propertyValue,
        }
      : {}

    this.campaigns.update({
      where: { id: campaign.id },
      data: {
        ...(propertyName === 'verified_candidates' && !campaign.isVerified
          ? { isVerified: propertyValue === 'Yes' }
          : {}),
        ...(propertyName === 'pro_candidate' && !campaign.isPro
          ? { isPro: propertyValue === 'Yes' }
          : {}),
      },
    })

    this.campaigns.updateJsonFields(campaign.id, {
      data: {
        ...hubSpotUpdates,
      },
    })

    this.fullStory.trackUserById(campaign.userId)
  }

  /** Pushes campaign data to Hubspot record
   *
   * @param campaignId - The unique identifier of the campaign to refresh. If provided, only that campaign is processed;
   *                     otherwise, all campaigns with a Hubspot ID are refreshed.
   */
  async refreshCompanies(campaignId?: number) {
    let updated = 0
    const failures: number[] = []

    const runRefresh = async (campaignId: number) => {
      try {
        await this.trackCampaign(campaignId)
        updated++
      } catch (error) {
        failures.push(campaignId)
        this.logger.error('error updating campaign', error)
        await this.slack.errorMessage({
          message: `Error updating campaign ${campaignId} in hubspot`,
          error,
        })
      }
    }

    if (campaignId) {
      await runRefresh(campaignId)
    } else {
      const campaigns = await this.campaigns.findMany({
        select: {
          id: true,
        },
        where: {
          data: {
            path: ['hubspotId'],
            not: Prisma.AnyNull,
          },
        },
      })

      for (const campaign of campaigns) {
        await runRefresh(campaign.id)
      }
    }

    return {
      message: 'ok',
      updated,
      failures,
    }
  }

  /**
   * Updates Hubspot company records for all campaigns with a Hubspot ID.
   *
   * @param fields - An array of property names to refresh. Pass ['all'] to refresh all properties.
   */
  async massRefreshCompanies(
    fields: Array<keyof CRMCompanyProperties | 'all'>,
  ) {
    const campaigns = await this.campaigns.findMany({
      where: {
        data: {
          path: ['hubspotId'],
          not: Prisma.AnyNull,
        },
      },
    })

    const companyUpdateObjects = await Promise.all(
      campaigns.map(async (campaign) => {
        const id = campaign.data.hubspotId as string
        const crmCompanyProperties =
          await this.calculateCRMCompanyProperties(campaign)
        const includeAll = fields.length === 1 && fields.includes('all')

        const properties = includeAll
          ? crmCompanyProperties
          : fields.reduce((acc, field) => {
              if (
                crmCompanyProperties[field] ||
                crmCompanyProperties[field] === null
              ) {
                acc[field] = crmCompanyProperties[field]
              }
              return acc
            }, {})

        return { id, properties } as SimplePublicObjectBatchInput
      }),
    )

    const updates = await this.hubspot.client.crm.companies.batchApi.update({
      inputs: companyUpdateObjects,
    })

    return {
      message: `OK: ${updates?.results?.length} companies updated`,
    }
  }

  /** Pulls Hubspot data and updates campaign
   *
   * @param campaignId - The unique identifier of the campaign to sync. If provided, only that campaign is processed;
   *                     otherwise, all campaigns are processed.
   * @param resync - If false, skips campaigns that already have HubSpot updates.
   */
  async syncCampaign(campaignId?: number, resync: boolean = false) {
    let updated = 0

    const campaigns = campaignId
      ? [await this.campaigns.findFirst({ where: { id: campaignId } })]
      : await this.campaigns.findMany()

    for (let i = 0; i < campaigns.length; i++) {
      const campaign = campaigns[i]
      try {
        const { id: campaignId } = campaign!
        if (campaign?.data?.hubSpotUpdates && !resync) {
          this.logger.log(`Skipping resync - ${campaignId}`)
          continue
        }
        const { data: campaignData } = campaign || {}
        const { hubspotId } = campaignData || {}
        const company = hubspotId
          ? await this.getCrmCompanyById(hubspotId)
          : null
        if (!company) {
          this.logger.error(`No company found - ${campaignId}`)
          continue
        }

        this.logger.log(`Syncing - ${campaignId}`)

        const { verified_candidates, pro_candidate, election_results } =
          company.properties

        const hubSpotUpdates = pick(
          company.properties,
          HUBSPOT_COMPANY_PROPERTIES,
        ) as Record<string, string>

        const updatedCampaign: Partial<Campaign> = {
          data: campaign?.data,
        }

        if (
          String(verified_candidates).toLowerCase() === 'yes' &&
          !campaign?.isVerified
        ) {
          updatedCampaign.isVerified = true
        }

        if (String(pro_candidate).toLowerCase() === 'yes' && !campaign?.isPro) {
          updatedCampaign.isPro = true
        }

        if (
          String(election_results).toLowerCase() === 'won general' &&
          !campaign?.didWin
        ) {
          updatedCampaign.didWin = true
        }
        /* eslint-enable camelcase */

        await this.campaigns.update({
          where: { id: campaignId },
          data: updatedCampaign,
        })
        await this.campaigns.updateJsonFields(campaignId, {
          data: {
            hubSpotUpdates,
          },
        })
        updated++
      } catch (error) {
        this.logger.error('error at crm/sync', error)
        this.slack.errorMessage({
          message: `error at crm/sync - campaignSlug: ${campaign?.slug}}`,
          error,
        })
      }
    }

    this.slack.message(
      { body: `completed crm/sync - updated: ${updated}` },
      SlackChannel.botDev,
    )

    return {
      message: 'ok',
      updated,
    }
  }
}
