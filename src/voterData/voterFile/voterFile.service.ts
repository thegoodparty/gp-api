import { Injectable, Logger } from '@nestjs/common'
import { CampaignWith } from 'src/campaigns/campaigns.types'
import { GetVoterFileSchema } from './schemas/GetVoterFile.schema'
import { CHANNEL_TO_TYPE_MAP } from './voterFile.types'
import { typeToQuery } from './util/voterFile.util'
import { VoterDataService } from '../voterData.service'
import { User } from '@prisma/client'
import { SlackService } from 'src/shared/services/slack.service'

@Injectable()
export class VoterFileService {
  private readonly logger = new Logger(VoterFileService.name)

  constructor(
    private readonly voterDataService: VoterDataService,
    private readonly slack: SlackService,
  ) {}

  async getCsv(
    campaign: CampaignWith<'pathToVictory'>,
    { type, countOnly, customFilters }: GetVoterFileSchema,
  ) {
    const resolvedType =
      type === 'custom' && customFilters
        ? CHANNEL_TO_TYPE_MAP[customFilters.channel]
        : type

    const countQuery = typeToQuery(resolvedType, campaign, customFilters, true)
    this.logger.debug('Count Query:', countQuery)
    let withFixColumns = false
    const sqlResponse = await this.voterDataService.query(countQuery)
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
      const sqlResponse = await this.voterDataService.query(countQuery)
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
    return this.voterDataService.csvStream(query)
  }

  canDownload(campaign?: CampaignWith<'pathToVictory'>) {
    if (!campaign) return false

    let electionTypeRequired = true
    if (
      campaign.details.ballotLevel &&
      campaign.details.ballotLevel !== 'FEDERAL' &&
      campaign.details.ballotLevel !== 'STATE'
    ) {
      // not required for state/federal races
      // so we can fall back to the whole state.
      electionTypeRequired = false
    }
    if (
      electionTypeRequired &&
      (!campaign.pathToVictory?.data?.electionType ||
        !campaign.pathToVictory?.data?.electionLocation)
    ) {
      this.logger.log('Campaign is not eligible for download.', campaign.id)
      return false
    } else {
      return true
    }
  }

  async doVoterDownloadCheck(
    campaign: CampaignWith<'pathToVictory'>,
    user: User,
  ) {
    const canDownload = !campaign ? false : await this.canDownload(campaign)
    if (!canDownload) {
      // alert Jared and Rob.
      const alertSlackMessage = `<@U01AY0VQFPE> and <@U03RY5HHYQ5>`
      await this.slack.message(
        {
          title: 'Path To Victory',
          body: `Campaign ${campaign.slug} has been upgraded to Pro but the voter file is not available. Email: ${user.email}
          visit https://goodparty.org/admin/pro-no-voter-file to see all users without L2 data
          ${alertSlackMessage}
          `,
        },
        // TODO: implement appEnvironment service
        // appEnvironment === PRODUCTION_ENV ? 'politics' :
        'dev',
      )
    }
  }
}
