import { Logger } from '@nestjs/common'
import { User } from '@prisma/client'
import { CampaignWith } from '../../campaigns/campaigns.types'
import { SlackService } from '../../vendors/slack/services/slack.service'
import { SlackChannel } from '../../vendors/slack/slackService.types'
import { IS_PROD } from '../util/appEnvironment.util'

export class VoterFileDownloadAccessService {
  private readonly logger = new Logger(VoterFileDownloadAccessService.name)
  constructor(private readonly slack: SlackService) { }

  canDownload(campaign?: CampaignWith<'pathToVictory'>) {
    if (!campaign) return false

    const details = campaign.details as { ballotLevel?: string }
    const ballotLevel = details?.ballotLevel

    if (
      ballotLevel &&
      ballotLevel !== 'FEDERAL' && ballotLevel !== 'STATE'
    ) {
      // not required for local races
      // so we can fall back to the whole state.
      return true
    } else if (
      ballotLevel &&
      (ballotLevel === 'FEDERAL' || ballotLevel === 'STATE') && campaign.canDownloadFederal
    ) {
      // not required for federal/state races with canDownloadFederal flag
      return true
    } else if (
      campaign.pathToVictory?.data?.electionType &&
      campaign.pathToVictory?.data?.electionLocation
    ) {
      return true
    } else {
      this.logger.log('Campaign is not eligible for download.', campaign.id)
      return false
    }
  }

  async downloadAccessAlert(
    campaign: CampaignWith<'pathToVictory'>,
    user: User,
  ) {
    const canDownload = !campaign ? false : await this.canDownload(campaign)
    if (!canDownload) {
      // alert Jared and Rob.
      const alertSlackMessage = `<@U01AY0VQFPE> and <@U03RY5HHYQ5>`
      await this.slack.message(
        {
          body: `Campaign ${campaign.slug} has been upgraded to Pro but the voter file is not available. Email: ${user.email}
          visit https://goodparty.org/admin/pro-no-voter-file to see all users without L2 data
          ${alertSlackMessage}
          `,
        },
        IS_PROD ? SlackChannel.botPolitics : SlackChannel.botDev,
      )
    }
  }
}
