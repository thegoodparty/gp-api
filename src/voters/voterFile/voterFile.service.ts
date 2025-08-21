import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common'
import { Campaign, User } from '@prisma/client'
import { CampaignWith } from 'src/campaigns/campaigns.types'
import { CampaignTaskType } from 'src/campaigns/tasks/campaignTasks.types'
import { SlackService } from 'src/shared/services/slack.service'
import { IS_PROD } from 'src/shared/util/appEnvironment.util'
import { CrmCampaignsService } from '../../campaigns/services/crmCampaigns.service'
import { SlackChannel } from '../../shared/services/slackService.types'
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

@Injectable()
export class VoterFileService {
  private readonly logger = new Logger(VoterFileService.name)

  constructor(
    private readonly voterDb: VoterDatabaseService,
    private readonly slack: SlackService,
    @Inject(forwardRef(() => CrmCampaignsService))
    private readonly crm: CrmCampaignsService,
  ) {}

  async getCsvOrCount(
    campaign: CampaignWith<'pathToVictory'>,
    {
      type,
      countOnly,
      customFilters,
      selectedColumns,
      limit,
    }: GetVoterFileSchema,
  ) {
    // Resolve type once at the beginning
    const resolvedType: VoterFileType =
      type === VoterFileType.custom && customFilters?.channel
        ? CHANNEL_TO_TYPE_MAP[customFilters.channel]
        : (Object.values(CampaignTaskType) as string[]).includes(type as string)
          ? TASK_TO_TYPE_MAP[type as CampaignTaskType]
          : (type as VoterFileType)

    if (countOnly) {
      return this.getVoterCount(resolvedType, campaign, customFilters)
    }

    return this.getVoterCsv(
      resolvedType,
      campaign,
      customFilters,
      selectedColumns,
      limit,
    )
  }

  private async getVoterCount(
    resolvedType: VoterFileType,
    campaign: CampaignWith<'pathToVictory'>,
    customFilters?: GetVoterFileSchema['customFilters'],
  ): Promise<number> {
    // Try regular count first
    const countQuery = typeToQuery(
      resolvedType,
      campaign,
      customFilters,
      true,
      false,
    )
    this.logger.debug('Count Query:', countQuery)

    const sqlResponse = await this.voterDb.query(countQuery)
    const count = parseInt(sqlResponse.rows[0].count)

    // If count is 0, try with fix columns as fallback
    if (count === 0) {
      const countQueryWithFix = typeToQuery(
        resolvedType,
        campaign,
        customFilters,
        true,
        true,
      )
      this.logger.debug('Count Query with Fix Columns:', countQueryWithFix)
      const sqlResponseWithFix = await this.voterDb.query(countQueryWithFix)
      return parseInt(sqlResponseWithFix.rows[0].count)
    }

    return count
  }

  private async getVoterCsv(
    resolvedType: VoterFileType,
    campaign: CampaignWith<'pathToVictory'>,
    customFilters?: GetVoterFileSchema['customFilters'],
    selectedColumns?: GetVoterFileSchema['selectedColumns'],
    limit?: GetVoterFileSchema['limit'],
  ) {
    // Check if we need to use fixColumns by doing a quick count check
    const countQuery = typeToQuery(
      resolvedType,
      campaign,
      customFilters,
      true,
      false,
    )
    this.logger.debug('Count Query:', countQuery)

    const sqlResponse = await this.voterDb.query(countQuery)
    const count = parseInt(sqlResponse.rows[0].count)
    const withFixColumns = count === 0

    this.logger.debug('count', count)

    // Generate CSV with appropriate fixColumns setting
    const query = typeToQuery(
      resolvedType,
      campaign,
      customFilters,
      false,
      withFixColumns,
      selectedColumns,
      limit,
    )
    this.logger.debug('Constructed Query:', query)
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

    const candidateOffice =
      details.office?.toLowerCase().trim() === 'other'
        ? details.otherOffice
        : details.office

    const slackBlocks = buildSlackBlocks({
      name: `${firstName} ${lastName}`,
      email,
      phone,
      office: candidateOffice,
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
