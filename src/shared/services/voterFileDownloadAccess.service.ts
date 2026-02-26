import { CampaignWith } from '@/campaigns/campaigns.types'
import { IS_PROD } from '@/shared/util/appEnvironment.util'
import { SlackService } from '@/vendors/slack/services/slack.service'
import { SlackChannel } from '@/vendors/slack/slackService.types'
import { Inject, OnModuleInit } from '@nestjs/common'
import { User } from '@prisma/client'
import { PinoLogger } from 'nestjs-pino'

export class VoterFileDownloadAccessService implements OnModuleInit {
  @Inject()
  private readonly logger!: PinoLogger

  constructor(private readonly slack: SlackService) {}

  onModuleInit() {
    this.logger.setContext(VoterFileDownloadAccessService.name)
  }

  canDownload(campaign?: CampaignWith<'pathToVictory'>) {
    if (!campaign) return false

    const ballotLevel = campaign.details?.ballotLevel
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
      this.logger.info(
        { id: campaign.id },
        'Campaign is not eligible for download.',
      )
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
