import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common'
import usStates from 'states-us'
import { HubSpot } from '../../crm/crm.types'
import {
  ApiException,
  SimplePublicObject,
  SimplePublicObjectBatchInput,
} from '@hubspot/api-client/lib/codegen/crm/companies'
import { HubspotService } from '../../crm/hubspot.service'
import { CampaignsService } from './campaigns.service'
import { SlackService } from '../../shared/services/slack.service'
import { Campaign, Prisma, User } from '@prisma/client'
import { getUserFullName } from '../../users/util/users.util'
import { formatDateForCRM } from '../../crm/util/cms.util'
import { CrmUsersService } from '../../users/services/crmUsers.service'
import { UsersService } from '../../users/services/users.service'
import { AssociationSpecAssociationCategoryEnum } from '@hubspot/api-client/lib/codegen/crm/associations/v4/models/AssociationSpec'
import { AssociationTypes } from '@hubspot/api-client'
import { AiChatService } from '../ai/chat/aiChat.service'
import { PathToVictoryService } from '../../pathToVictory/services/pathToVictory.service'
import { CampaignUpdateHistoryService } from '../updateHistory/campaignUpdateHistory.service'
import { IS_PROD } from '../../shared/util/appEnvironment.util'
import { FullStoryService } from '../../fullStory/fullStory.service'
import { pick } from '../../shared/util/objects.util'
import { SlackChannel } from '../../shared/services/slackService.types'
import { VoterFileDownloadAccessService } from '../../shared/services/voterFileDownloadAccess.service'
import { EcanvasserIntegrationService } from '../../ecanvasserIntegration/services/ecanvasserIntegration.service'
import {
  CRMCompanyProperties,
  CRMCompanyPropertiesSchema,
} from 'src/crm/schemas/CRMCompanyProperties.schema'
import {
  P2V_LOCKED_STATUS,
  P2VStatus,
} from 'src/elections/types/pathToVictory.types'
import { CampaignCreatedBy, OnboardingStep } from '../campaigns.types'

const HUBSPOT_COMPANY_PROPERTIES = Object.values(HubSpot.IncomingProperty)

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
    private readonly ecanvasser: EcanvasserIntegrationService,
  ) {}

  async getCrmCompanyById(hubspotId: string) {
    try {
      return await this.hubspot.client.crm.companies.basicApi.getById(
        hubspotId,
        HUBSPOT_COMPANY_PROPERTIES,
      )
    } catch (error) {
      const message = 'hubspot error - get-company-by-id'
      this.logger.error(message, error)
      this.slack.errorMessage({
        message,
        error,
      })
    }
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
      const { firstName, lastName } = crmCompanyOwner || {}
      crmCompanyOwnerName = `${firstName ? `${firstName} ` : ''}${
        lastName ? lastName : ''
      }`
    } catch (e) {
      this.logger.error('error getting crm company owner', e)
    }
    return crmCompanyOwnerName
  }

  private async createCompany(companyObj: CRMCompanyProperties) {
    if (!IS_PROD) return

    let crmCompany: SimplePublicObject | null = null
    try {
      crmCompany = await this.hubspot.client.crm.companies.basicApi.create({
        properties: companyObj,
      })
    } catch (error) {
      this.logger.error('error creating company', error)
      this.slack.errorMessage({
        message: `Error creating company for ${companyObj.candidate_name} in hubspot`,
        error,
      })
    }

    if (!crmCompany) {
      this.slack.errorMessage({
        message: `Error creating company for ${companyObj.candidate_name} in hubspot. No response from hubspot.`,
      })
      return
    }

    this.logger.debug('CRM Company created:', crmCompany)

    return crmCompany
  }

  private async updateCrmCompany(
    hubspotId: string,
    crmCompanyProperties: CRMCompanyProperties,
  ) {
    if (!IS_PROD) return

    let crmCompany: SimplePublicObject

    try {
      crmCompany = await this.hubspot.client.crm.companies.basicApi.update(
        hubspotId,
        { properties: crmCompanyProperties },
      )
    } catch (e) {
      const { candidate_name: name } = crmCompanyProperties
      this.logger.error('error updating crm', e)
      if (e instanceof ApiException && e.code === 404) {
        this.slack.errorMessage({
          message: `Could not find hubspot company for ${name} with hubspotId ${hubspotId}`,
          error: e,
        })

        const campaign = await this.campaigns.findByHubspotId(hubspotId)

        campaign &&
          (await this.campaigns.updateJsonFields(campaign.id, {
            data: {
              hubspotId: null,
            },
          }))
      } else {
        this.slack.errorMessage({
          message: `Error updating company for ${name} with existing hubspotId: ${hubspotId} in hubspot`,
          error: e,
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
    const user: User =
      (await this.users.findByCampaign(campaign)) || ({} as User)
    const aiChatCount = userId
      ? await this.aiChat.count({ where: { id: userId } })
      : 0
    const pathToVictory = await this.pathToVictory.findFirst({
      where: { campaignId: campaignId },
    })
    const p2vData = pathToVictory?.data || {}

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
      subscriptionCanceledAt,
    } = campaignDetails || {}

    const canDownloadVoterFile = this.voterFile.canDownload({
      ...campaign,
      pathToVictory,
    })

    const lastPortalVisit = formatDateForCRM(user.metaData?.lastVisited)
    const sessionCount = user.metaData?.sessionCount
    const name = getUserFullName(user as User)

    const electionDateMs = formatDateForCRM(electionDate)
    const primaryElectionDateMs = formatDateForCRM(primaryElectionDate)
    const isProUpdatedAtMs = formatDateForCRM(isProUpdatedAt)
    const p2vCompleteDateMs = formatDateForCRM(p2vCompleteDate)
    const filingStartMs = formatDateForCRM(filingPeriodsStart)
    const filingEndMs = formatDateForCRM(filingPeriodsEnd)
    const lastStepDateMs = formatDateForCRM(lastStepDate)
    const resolvedOffice = office === 'Other' ? otherOffice : office

    const longState = usStates.find(
      (usState) => usState.abbreviation === state?.toUpperCase(),
    )?.name

    // TODO: need to figure out what to do with this in HS
    const proSubscriptionStatus = campaign.isPro
      ? HubSpot.ProSubStatus.ACTIVE
      : HubSpot.ProSubStatus.INACTIVE

    const p2v_status =
      p2vNotNeeded || !p2vStatus
        ? P2V_LOCKED_STATUS
        : totalRegisteredVoters
          ? P2VStatus.complete
          : p2vStatus

    const ecanvasser = await this.ecanvasser.findByCampaignId(campaignId)
    let ecanvasserCount = 0
    let ecanvasserInteractionsCount = 0
    if (ecanvasser) {
      // get count of contacts and interactions
      const { contacts, interactions } = ecanvasser
      ecanvasserCount = contacts.length
      ecanvasserInteractionsCount = interactions.length
    }

    const fieldsToSync: Record<
      HubSpot.OutgoingProperty,
      string | number | undefined
    > = {
      // voter contact numbers
      calls_made: reportedVoterGoals?.calls,
      direct_mail_sent: reportedVoterGoals?.directMail,
      event_impressions: reportedVoterGoals?.events,
      knocked_doors: ecanvasserInteractionsCount, // TODO: remove/rename one of these two doorknock fields?
      doors_knocked: reportedVoterGoals?.doorKnocking, // TODO: remove/rename one of these two doorknock fields?
      online_impressions: reportedVoterGoals?.digitalAds,
      yard_signs_impressions: reportedVoterGoals?.yardSigns,
      // p2p_texts: reportedVoterGoals?.text, TODO: we need a new field in HS for sms text contact numbers!!!
      ecanvasser_contacts_count: ecanvasserCount,

      // candidate details
      candidate_district: district,
      candidate_email: user?.email,
      candidate_name: name,
      name: name,
      candidate_office: resolvedOffice,
      office_level: ballotLevel,
      candidate_party: party,
      candidate_state: longState,
      state: longState,
      city: city ?? undefined,
      zip: zip ?? undefined,
      created_by_admin:
        createdBy === CampaignCreatedBy.ADMIN
          ? HubSpot.CreatedByAdmin.YES
          : HubSpot.CreatedByAdmin.NO,
      admin_user: adminUserEmail,
      pledge_status: pledged
        ? HubSpot.PledgeStatus.YES
        : HubSpot.PledgeStatus.NO,
      pro_candidate: isPro ? HubSpot.ProCandidate.YES : HubSpot.ProCandidate.NO,
      pro_subscription_status: proSubscriptionStatus,
      pro_upgrade_date: isProUpdatedAtMs,
      running: runForOffice ? HubSpot.Running.YES : HubSpot.Running.NO,

      // election details
      br_position_id: campaignDetails?.positionId ?? undefined,
      br_race_id: campaignDetails?.raceId ?? undefined,
      election_date: electionDateMs,
      filing_deadline: filingEndMs, // TODO: is this different than filing_end?
      filing_start: filingStartMs,
      filing_end: filingEndMs,
      primary_date: primaryElectionDateMs,

      // usage details
      last_portal_visit: lastPortalVisit,
      last_step: isActive ? OnboardingStep.complete : String(currentStep ?? ''),
      last_step_date: lastStepDateMs,
      campaign_assistant_chats: aiChatCount,
      my_content_pieces_created: aiContent ? Object.keys(aiContent).length : 0,
      product_sessions: sessionCount,
      voter_files_created: campaignData?.customVoterFiles?.length,
      voter_data_adoption: canDownloadVoterFile
        ? HubSpot.VoterDataAdoption.UNLOCKED
        : HubSpot.VoterDataAdoption.LOCKED,

      // p2v details / viability
      automated_score:
        typeof score === 'number'
          ? Math.floor(score > 5 ? 5 : score)
          : undefined,
      p2v_status: p2v_status,
      //NOTE: Older versions of these fields may be strings, so we need to convert to numbers in case
      seats_available: seats ? Number(seats) : undefined,
      totalregisteredvoters: totalRegisteredVoters
        ? Number(totalRegisteredVoters)
        : undefined,
      votegoal: p2vData?.voterContactGoal
        ? Number(p2vData?.voterContactGoal)
        : undefined,
      win_number: winNumber ? Number(winNumber) : undefined,
    }

    const validated = CRMCompanyPropertiesSchema.transform((obj) =>
      Object.fromEntries(
        // remove undefined values, just to be safe
        Object.entries(obj).filter(([_, v]) => v !== undefined),
      ),
    ).safeParse(fieldsToSync)

    if (!validated.success) {
      // Handle validation errors
      const msg = 'CRM Push cancelled - validation failed'
      this.logger.error(msg, {
        errors: validated.error.errors,
        fields: fieldsToSync,
      })
      this.slack.errorMessage({
        message: msg,
        error: validated.error,
      })
      return null
    }

    return validated.data
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
        '0-2',
        '0-1',
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
    const campaign = await this.campaigns.findUniqueOrThrow({
      where: { id: campaignId },
    })

    const { data: campaignData, userId } = campaign
    const { hubspotId: existingHubspotId } = campaignData

    const crmCompanyProperties =
      await this.calculateCRMCompanyProperties(campaign)

    if (!crmCompanyProperties) {
      return
    }

    this.logger.debug('CRM Company Properties:', crmCompanyProperties)

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
      this.logger.debug(message)
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
    // first reload campaign data to avoid race conditions
    const { data: updatedCampaignData } =
      await this.campaigns.findUniqueOrThrow({
        where: { id: campaignId },
        select: {
          data: true,
        },
      })

    await this.campaigns.update({
      where: { id: campaignId },
      data: {
        data: {
          ...updatedCampaignData,
          hubspotId: crmCompanyId,
          name: crmCompanyProperties.candidate_name,
        },
      },
    })

    // associate the Contact with the Company in Hubspot
    try {
      await this.associateCompanyWithContact(crmContactId, crmCompanyId)
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

  async handleUpdateCampaign(
    campaign: Campaign,
    propertyName: string,
    propertyValue: string,
  ) {
    const campaignData = campaign.data
    const hubSpotUpdates = campaignData.hubSpotUpdates || {}
    hubSpotUpdates[propertyName] = propertyValue

    const updatePayload: Prisma.CampaignUpdateInput = {
      data: {
        ...campaignData,
        hubSpotUpdates,
      },
    }

    if (propertyName === HubSpot.IncomingProperty.verified_candidates) {
      updatePayload.isVerified =
        propertyValue.toLowerCase() === HubSpot.VerifiedCandidate.YES
    }

    if (propertyName === HubSpot.IncomingProperty.election_results) {
      updatePayload.didWin =
        propertyValue.toLowerCase() === HubSpot.ElectionResult.WON_GENERAL
    }

    this.campaigns.update({
      where: { id: campaign.id },
      data: updatePayload,
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
        if (!crmCompanyProperties) {
          return { id, properties: {} } as SimplePublicObjectBatchInput
        }

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

        const hubSpotUpdates = pick(
          company.properties,
          HUBSPOT_COMPANY_PROPERTIES,
        ) as Partial<Record<HubSpot.IncomingProperty, string>>

        const updatedCampaign: Prisma.CampaignUpdateInput = {
          data: campaign?.data,
        }

        if (
          String(hubSpotUpdates.verified_candidates).toLowerCase() ===
          HubSpot.VerifiedCandidate.YES
        ) {
          updatedCampaign.isVerified = true
        }

        if (
          String(hubSpotUpdates.election_results).toLowerCase() ===
          HubSpot.ElectionResult.WON_GENERAL
        ) {
          updatedCampaign.didWin = true
        }

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
