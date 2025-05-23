import { Injectable, Logger } from '@nestjs/common'
import { SlackService } from 'src/shared/services/slack.service'
import { ScheduleOutreachCampaignSchema } from '../voterFile/schemas/ScheduleOutreachCampaign.schema'
import { Campaign, OutreachStatus, User } from '@prisma/client'
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
import { getUserFullName } from 'src/users/util/users.util'
import { EmailService } from 'src/email/email.service'
import { EmailTemplateName } from 'src/email/email.types'
import { OutreachService } from 'src/outreach/services/outreach.service'
import { VoterFileType } from '../voterFile/voterFile.types'

@Injectable()
export class VoterOutreachService {
  private readonly logger = new Logger(VoterOutreachService.name)

  constructor(
    private readonly slack: SlackService,
    private readonly filesService: FilesService,
    private readonly campaignsService: CampaignsService,
    private readonly crmCampaigns: CrmCampaignsService,
    private readonly emailService: EmailService,
    private readonly textCampaignService: OutreachService,
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
    imageUpload?: FileUpload,
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
    let imageUrl: string | null = null
    if (imageUpload) {
      const bucket = `scheduled-campaign/${campaign.slug}/${type}/${date}`
      imageUrl = await this.filesService.uploadFile(imageUpload, bucket)
    }

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
    if (type === VoterFileType.sms) {
      await this.textCampaignService.model.create({
        data: {
          campaignId: campaign.id,
          name: `SMS Campaign ${new Date(date).toLocaleDateString()}`,
          message,
          status: OutreachStatus.pending,
          ...(audience && {
            audience_superVoters: audience.audience_superVoters,
            audience_likelyVoters: audience.audience_likelyVoters,
            audience_unreliableVoters: audience.audience_unreliableVoters,
            audience_unlikelyVoters: audience.audience_unlikelyVoters,
            audience_firstTimeVoters: audience.audience_firstTimeVoters,
            party_independent: audience.party_independent,
            party_democrat: audience.party_democrat,
            party_republican: audience.party_republican,
            age_18_25: audience.age_18_25,
            age_25_35: audience.age_25_35,
            age_35_50: audience.age_35_50,
            age_50_plus: audience.age_50_plus,
            gender_male: audience.gender_male,
            gender_female: audience.gender_female,
            gender_unknown: audience.gender_unknown,
            audience_request: audience.audience_request,
          }),
          script: messagingScript,
          date: new Date(date),
          imageUrl,
        },
      })

      this.logger.debug(`Created TextCampaign for campaign ${campaign.id}`)
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

    this.sendSubmittedEmail(user, message, date)

    return true
  }

  async sendSubmittedEmail(user: User, message: string = 'N/A', date: string) {
    await this.emailService.sendTemplateEmail({
      to: user.email,
      subject: 'Your Texting Campaign is Scheduled - Next Steps Inside',
      template: EmailTemplateName.textCampaignSubmitted,
      variables: {
        name: getUserFullName(user),
        message,
        scheduledDate: date,
      },
    })
  }
}
