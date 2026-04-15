import { OrgDistrict } from '@/organizations/organizations.types'
import { IS_PROD } from '@/shared/util/appEnvironment.util'
import { SlackService } from '@/vendors/slack/services/slack.service'
import { SlackChannel } from '@/vendors/slack/slackService.types'
import { Inject, OnModuleInit } from '@nestjs/common'
import { Campaign, User } from '@prisma/client'
import { PinoLogger } from 'nestjs-pino'

export class VoterFileDownloadAccessService implements OnModuleInit {
  @Inject()
  private readonly logger!: PinoLogger

  constructor(private readonly slack: SlackService) {}

  onModuleInit() {
    this.logger.setContext(VoterFileDownloadAccessService.name)
  }

  canDownload(campaign?: Campaign, district?: OrgDistrict | null) {
    if (!campaign) return false

    const ballotLevel = campaign.details?.ballotLevel
    const hasElectionData = district?.l2Type && district?.l2Name

    const canDownload = Boolean(
      (ballotLevel && ballotLevel !== 'FEDERAL' && ballotLevel !== 'STATE') ||
        (ballotLevel &&
          (ballotLevel === 'FEDERAL' || ballotLevel === 'STATE') &&
          campaign.canDownloadFederal) ||
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
    campaign: Campaign,
    user: User,
    district?: OrgDistrict | null,
  ) {
    const canDownload = !campaign
      ? false
      : await this.canDownload(campaign, district)
    if (!canDownload) {
      // alert Jared and Rob.
      const alertSlackMessage = `<@U01AY0VQFPE> and <@U03RY5HHYQ5>`
      await this.slack.message(
        {
          text: `Campaign ${campaign.slug} has been upgraded to Pro but the voter file is not available. Email: ${user.email}\nvisit https://goodparty.org/admin/pro-no-voter-file to see all users without L2 data\n${alertSlackMessage}`,
        },
        IS_PROD ? SlackChannel.botPolitics : SlackChannel.botDev,
      )
    }
  }
}
