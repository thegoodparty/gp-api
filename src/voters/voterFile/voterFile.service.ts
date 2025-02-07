import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common'
import { CampaignWith } from 'src/campaigns/campaigns.types'
import { GetVoterFileSchema } from './schemas/GetVoterFile.schema'
import { CHANNEL_TO_TYPE_MAP } from './voterFile.types'
import { typeToQuery } from './util/voterFile.util'
import { VoterDatabaseService } from '../services/voterDatabase.service'
import { Campaign, User } from '@prisma/client'
import { SlackService } from 'src/shared/services/slack.service'
import { IS_PROD } from 'src/shared/util/appEnvironment.util'
import { buildSlackBlocks } from './util/slack.util'
import { HelpMessageSchema } from './schemas/HelpMessage.schema'
import { SlackChannel } from '../../shared/services/slackService.types'
import { CrmCampaignsService } from '../../campaigns/services/crmCampaigns.service'

@Injectable()
export class VoterFileService {
  private readonly logger = new Logger(VoterFileService.name)

  constructor(
    private readonly voterDb: VoterDatabaseService,
    private readonly slack: SlackService,
    @Inject(forwardRef(() => CrmCampaignsService))
    private readonly crm: CrmCampaignsService,
  ) {}

  async getCsv(
    campaign: CampaignWith<'pathToVictory'>,
    { type, countOnly, customFilters }: GetVoterFileSchema,
  ) {
    const resolvedType =
      type === 'custom' && customFilters?.channel
        ? CHANNEL_TO_TYPE_MAP[customFilters.channel]
        : type

    const countQuery = typeToQuery(resolvedType, campaign, customFilters, true)
    this.logger.debug('Count Query:', countQuery)
    let withFixColumns = false
    const sqlResponse = await this.voterDb.query(countQuery)
    const count = parseInt(sqlResponse.rows[0].count)
    if (count === 0) {
      withFixColumns = true
    }
    if (countOnly && count !== 0) {
      return count
    }
    if (countOnly && count === 0) {
      const countQuery = typeToQuery(
        resolvedType,
        campaign,
        customFilters,
        true,
        true,
      )
      const sqlResponse = await this.voterDb.query(countQuery)
      const count = parseInt(sqlResponse.rows[0].count)
      return count
    }

    this.logger.debug('count', sqlResponse.rows[0].count)

    const query = typeToQuery(
      resolvedType,
      campaign,
      customFilters,
      false,
      withFixColumns,
    )
    this.logger.debug('Constructed Query:', query)
    return this.voterDb.csvStream(query)
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
