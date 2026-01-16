import { CampaignWith } from '@/campaigns/campaigns.types'
import { IS_PROD } from '@/shared/util/appEnvironment.util'
import { SlackService } from '@/vendors/slack/services/slack.service'
import { SlackChannel } from '@/vendors/slack/slackService.types'
import { Logger } from '@nestjs/common'
import { User } from '@prisma/client'

export class VoterFileDownloadAccessService {
  private readonly logger = new Logger(VoterFileDownloadAccessService.name)
  constructor(private readonly slack: SlackService) { }

  canDownload(campaign?: CampaignWith<'pathToVictory'>) {
    if (!campaign) return false

    // Prisma's Json type doesn't preserve structure, so we assert the known type
    // This cast is necessary because details is typed as Json (union type) not CampaignDetails
    const ballotLevel = (
      campaign.details as PrismaJson.CampaignDetails | null
    )?.ballotLevel
    const hasElectionData =
      campaign.pathToVictory?.data?.electionType &&
      campaign.pathToVictory?.data?.electionLocation

    const canDownload = Boolean(
      // Local races (CITY, TOWNSHIP, etc.) - not required, can fall back to whole state
      (ballotLevel && ballotLevel !== 'FEDERAL' && ballotLevel !== 'STATE') ||
      // FEDERAL/STATE races with canDownloadFederal flag
      (ballotLevel &&
        (ballotLevel === 'FEDERAL' || ballotLevel === 'STATE') &&
        campaign.canDownloadFederal) ||
      // FEDERAL/STATE races with election data from PathToVictory SQS job
      hasElectionData,
    )

    if (!canDownload) {
      this.logger.log('Campaign is not eligible for download.', campaign.id)
    }

    return canDownload
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
