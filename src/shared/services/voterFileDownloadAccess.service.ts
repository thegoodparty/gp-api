import { CampaignWith } from '../../campaigns/campaigns.types'
import { Logger } from '@nestjs/common'
import { SlackService } from './slack.service'
import { User } from '@prisma/client'
import { IS_PROD } from '../util/appEnvironment.util'
import { SlackChannel } from './slackService.types'

export class VoterFileDownloadAccessService {
  private readonly logger = new Logger(VoterFileDownloadAccessService.name)
  constructor(private readonly slack: SlackService) {}

  canDownload(campaign?: CampaignWith<'pathToVictory'>) {
    if (!campaign) return false

    let electionTypeRequired = true
    if (
      campaign.details.ballotLevel &&
      campaign.details.ballotLevel !== 'FEDERAL' &&
      campaign.details.ballotLevel !== 'STATE' &&
      !campaign.canDownloadFederal
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
