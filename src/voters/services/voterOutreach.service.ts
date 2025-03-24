import { Injectable, Logger } from '@nestjs/common'
import { SlackService } from 'src/shared/services/slack.service'
import { ScheduleOutreachCampaignSchema } from '../voterFile/schemas/ScheduleOutreachCampaign.schema'
import { Campaign, User } from '@prisma/client'
import { buildSlackBlocks } from '../util/voterOutreach.util'
import { FileUpload } from 'src/files/files.types'
import { CampaignsService } from 'src/campaigns/services/campaigns.service'
import sanitizeHtml from 'sanitize-html'
import {
  IS_PROD,
  WEBAPP_API_PATH,
  WEBAPP_ROOT,
} from 'src/shared/util/appEnvironment.util'
import { VOTER_FILE_ROUTE } from '../voterFile/voterFile.controller'
import { FilesService } from 'src/files/files.service'
import {
  SlackChannel,
  SlackMessageType,
} from 'src/shared/services/slackService.types'
import { CrmCampaignsService } from '../../campaigns/services/crmCampaigns.service'
import { TextCampaignService } from 'src/textCampaign/services/textCampaign.service'

@Injectable()
export class VoterOutreachService {
  private readonly logger = new Logger(VoterOutreachService.name)

  constructor(
    private readonly slack: SlackService,
    private readonly filesService: FilesService,
    private readonly campaignsService: CampaignsService,
    private readonly crmCampaigns: CrmCampaignsService,
    private readonly textCampaignService: TextCampaignService,
  ) {}

  async scheduleOutreachCampaign(
    user: User,
    campaign: Campaign,
    {
      budget,
      audience,
      script,
      date,
      message,
      voicemail,
      type,
    }: ScheduleOutreachCampaignSchema,
    imageUpload: FileUpload,
  ) {
    const { firstName, lastName, email, phone } = user
    const { data } = campaign
    const { hubspotId: crmCompanyId } = data

    const messagingScript: string = campaign.aiContent?.[script]?.content
      ? sanitizeHtml(campaign.aiContent?.[script]?.content, {
          allowedTags: [],
          allowedAttributes: {},
        })
      : script

    // build Voter File URL
    let voterFileUrl
    try {
      const filters: string[] = []
      for (const key in audience) {
        if (audience[key] === true) {
          filters.push(key)
        }
      }
      const encodedFilters = encodeURIComponent(JSON.stringify({ filters }))
      voterFileUrl = `${WEBAPP_ROOT}${WEBAPP_API_PATH}${VOTER_FILE_ROUTE}?type=${type}&slug=${campaign.slug}&customFilters=${encodedFilters}`
    } catch (e) {
      this.logger.error('Error building voterFileUrl: ', e)
      voterFileUrl = null
    }

    // format audience filters for slack message
    const formattedAudience = Object.entries(audience)
      .map(([key, value]) => {
        if (key === 'audience_request') {
          return
        }

        return {
          type: SlackMessageType.RICH_TEXT_SECTION,
          elements: [
            {
              type: SlackMessageType.TEXT,
              text: `${key}: `,
              style: {
                bold: true,
              },
            },
            {
              type: SlackMessageType.TEXT,
              text: value ? '✅ Yes' : '❌ No',
            },
          ],
        }
      })
      // eslint-disable-next-line eqeqeq
      .filter((val) => val != undefined)

    // Upload image
    const bucket = `scheduled-campaign/${campaign.slug}/${type}/${date}`
    const imageUrl = await this.filesService.uploadFile(imageUpload, bucket)

    const slackBlocks = buildSlackBlocks({
      name: `${firstName} ${lastName}`,
      email,
      phone,
      assignedPa: crmCompanyId
        ? await this.crmCampaigns.getCrmCompanyOwnerName(crmCompanyId)
        : '',
      crmCompanyId,
      voterFileUrl,
      type,
      budget,
      voicemail,
      date,
      script,
      messagingScript,
      imageUrl,
      message,
      formattedAudience,
      audienceRequest: audience['audience_request'],
    })

    // If type is SMS, create a TextCampaign
    if (type === 'sms') {
      try {
        await this.textCampaignService.createTextCampaign(
          campaign.id,
          `SMS Campaign ${new Date(date).toLocaleDateString()}`,
          message,
          audience,
          messagingScript,
          new Date(date),
          imageUrl,
        )

        this.logger.log(`Created TextCampaign for campaign ${campaign.id}`)
      } catch (error: any) {
        this.logger.error(
          `Failed to create TextCampaign: ${error.message}`,
          error.stack,
        )
      }
    }

    await this.slack.message(
      slackBlocks,
      IS_PROD ? SlackChannel.botPolitics : SlackChannel.botDev,
    )

    // this is sent to hubspot on update
    await this.campaignsService.update({
      where: { id: campaign.id },
      data: {
        data: {
          ...campaign.data,
          textCampaignCount: (campaign.data.textCampaignCount || 0) + 1,
        },
      },
    })

    this.crmCampaigns.trackCampaign(campaign.id)

    return true
  }
}
