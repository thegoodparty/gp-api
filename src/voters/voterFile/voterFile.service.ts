import { forwardRef, Inject, Injectable } from '@nestjs/common'
import { Campaign, OutreachType, User } from '@prisma/client'
import { CampaignTaskType } from 'src/campaigns/tasks/campaignTasks.types'
import { OrgDistrict } from 'src/organizations/organizations.types'
import { SlackService } from 'src/vendors/slack/services/slack.service'
import { IS_PROD } from 'src/shared/util/appEnvironment.util'
import { WrapperType } from 'src/shared/types/utility.types'
import { CrmCampaignsService } from '../../campaigns/services/crmCampaigns.service'
import { SlackChannel } from '../../vendors/slack/slackService.types'
import { VoterDatabaseService } from '../services/voterDatabase.service'
import { GetVoterFileSchema } from './schemas/GetVoterFile.schema'
import { HelpMessageSchema } from './schemas/HelpMessage.schema'
import { buildSlackBlocks } from './util/slack.util'
import { typeToQuery } from './util/voterFile.util'
import {
  CHANNEL_TO_TYPE_MAP,
  TASK_TO_TYPE_MAP,
  VoterFileType,
} from './voterFile.types'
import { PinoLogger } from 'nestjs-pino'
import { OrganizationsService } from '@/organizations/services/organizations.service'

@Injectable()
export class VoterFileService {
  constructor(
    private readonly voterDb: VoterDatabaseService,
    private readonly slack: SlackService,
    @Inject(forwardRef(() => CrmCampaignsService))
    private readonly crm: WrapperType<CrmCampaignsService>,
    private readonly organizations: OrganizationsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(VoterFileService.name)
  }

  async getCsvOrCount(
    campaign: Campaign,
    {
      type,
      countOnly,
      customFilters,
      selectedColumns,
      limit,
    }: GetVoterFileSchema,
    district: OrgDistrict | null,
  ) {
    // Resolve type once at the beginning
    const resolvedType: VoterFileType =
      type === VoterFileType.custom && customFilters?.channel
        ? CHANNEL_TO_TYPE_MAP[customFilters.channel]
        : (Object.values(CampaignTaskType) as string[]).includes(type as string)
          ? // Union narrowing from dynamic input — runtime value comes from user request
            // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
            TASK_TO_TYPE_MAP[type as CampaignTaskType]
          : type === OutreachType.p2p
            ? VoterFileType.sms
            : // Union narrowing from dynamic input — runtime value comes from user request
              // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
              (type as VoterFileType)

    if (countOnly) {
      return this.getVoterCount(resolvedType, campaign, district, customFilters)
    }

    return this.getVoterCsv(
      resolvedType,
      campaign,
      district,
      customFilters,
      selectedColumns,
      limit,
    )
  }

  private async getVoterCount(
    resolvedType: VoterFileType,
    campaign: Campaign,
    district: OrgDistrict | null,
    customFilters?: GetVoterFileSchema['customFilters'],
  ): Promise<number> {
    // Try regular count first
    const countQuery = typeToQuery(
      this.logger,
      resolvedType,
      campaign,
      district,
      customFilters,
      true,
      false,
    )
    this.logger.debug({ countQuery }, 'Count Query:')

    const sqlResponse = await this.voterDb.query<{ count: string }>(countQuery)
    const count = parseInt(String(sqlResponse.rows[0].count))

    // If count is 0, try with fix columns as fallback
    if (count === 0) {
      const countQueryWithFix = typeToQuery(
        this.logger,
        resolvedType,
        campaign,
        district,
        customFilters,
        true,
        true,
      )
      this.logger.debug({ countQueryWithFix }, 'Count Query with Fix Columns:')
      const sqlResponseWithFix = await this.voterDb.query<{ count: string }>(
        countQueryWithFix,
      )
      return parseInt(String(sqlResponseWithFix.rows[0].count))
    }

    return count
  }

  private async getVoterCsv(
    resolvedType: VoterFileType,
    campaign: Campaign,
    district: OrgDistrict | null,
    customFilters?: GetVoterFileSchema['customFilters'],
    selectedColumns?: GetVoterFileSchema['selectedColumns'],
    limit?: GetVoterFileSchema['limit'],
  ) {
    // Check if we need to use fixColumns by doing a quick count check
    const countQuery = typeToQuery(
      this.logger,
      resolvedType,
      campaign,
      district,
      customFilters,
      true,
      false,
    )
    this.logger.debug({ countQuery }, 'Count Query:')

    const sqlResponse = await this.voterDb.query<{ count: string }>(countQuery)
    const count = parseInt(String(sqlResponse.rows[0].count))
    const withFixColumns = count === 0

    this.logger.debug({ count }, 'count')

    // Generate CSV with appropriate fixColumns setting
    const query = typeToQuery(
      this.logger,
      resolvedType,
      campaign,
      district,
      customFilters,
      false,
      withFixColumns,
      selectedColumns,
      limit,
    )
    this.logger.debug({ query }, 'Constructed Query:')
    return this.voterDb.csvStream(query, 'voters', selectedColumns)
  }

  wakeUp() {
    const query = `SELECT "LALVOTERID"
                   FROM public."VoterCA"
                   where "LALVOTERID" = 'LALCA3184219' limit 1`
    return this.voterDb.csvStream(query)
  }

  async helpMessage(
    user: User,
    campaign: Campaign,
    { type, message }: HelpMessageSchema,
  ) {
    const { firstName, lastName, email, phone } = user
    const { details, tier, data } = campaign
    const { hubspotId: crmCompanyId } = data

    const candidatePositionName = campaign.organizationSlug
      ? await this.organizations.resolvePositionNameByOrganizationSlug(
          campaign.organizationSlug,
        )
      : null

    const slackBlocks = buildSlackBlocks({
      name: `${firstName} ${lastName}`,
      email,
      phone,
      office: candidatePositionName ?? undefined,
      state: details.state,
      tier,
      type,
      message,
      assignedPa: crmCompanyId
        ? await this.crm.getCrmCompanyOwnerName(crmCompanyId)
        : '',
      crmCompanyId,
    })

    await this.slack.message(
      slackBlocks,
      IS_PROD ? SlackChannel.botPolitics : SlackChannel.botDev,
    )

    return true
  }
}
