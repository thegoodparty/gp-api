import { Injectable, Logger } from '@nestjs/common'
import { SlackService } from 'src/shared/services/slack.service'
import { ScheduleOutreachCampaignSchema } from '../voterFile/schemas/ScheduleOutreachCampaign.schema'
import { Campaign, OutreachStatus, OutreachType, User } from '@prisma/client'
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
import { VoterFileFilterService } from './voterFileFilter.service'

@Injectable()
export class VoterOutreachService {
  private readonly logger = new Logger(VoterOutreachService.name)

  constructor(
    private readonly slack: SlackService,
    private readonly filesService: FilesService,
    private readonly campaignsService: CampaignsService,
    private readonly crmCampaigns: CrmCampaignsService,
    private readonly email: EmailService,
    private readonly outreachService: OutreachService,
    private readonly voterFileFilterService: VoterFileFilterService,
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
    const {
      audience_superVoters,
      audience_likelyVoters,
      audience_unreliableVoters,
      audience_unlikelyVoters,
      audience_firstTimeVoters,
      party_independent,
      party_democrat,
      party_republican,
      age_18_25,
      age_25_35,
      age_35_50,
      age_50_plus,
      gender_male,
      gender_female,
    } = audience || {}

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
      const voterFileFilter = audience
        ? await this.voterFileFilterService.create(campaign.id, {
            name: `SMS Campaign ${new Date(date).toLocaleDateString()}`,
            audienceSuperVoters: audience_superVoters,
            audienceLikelyVoters: audience_likelyVoters,
            audienceUnreliableVoters: audience_unreliableVoters,
            audienceUnlikelyVoters: audience_unlikelyVoters,
            audienceFirstTimeVoters: audience_firstTimeVoters,
            partyIndependent: party_independent,
            partyDemocrat: party_democrat,
            partyRepublican: party_republican,
            age18_25: age_18_25,
            age25_35: age_25_35,
            age35_50: age_35_50,
            age50Plus: age_50_plus,
            genderMale: gender_male,
            genderFemale: gender_female,
          })
        : null

      await this.outreachService.model.create({
        data: {
          campaignId: campaign.id,
          outreachType: OutreachType.text,
          name: `SMS Campaign ${new Date(date).toLocaleDateString()}`,
          message,
          status: OutreachStatus.pending,
          script: messagingScript,
          date: new Date(date),
          imageUrl,
          ...(voterFileFilter && { voterFileFilterId: voterFileFilter.id }),
        },
      })

      this.logger.debug(`Scheduled TextCampaign for campaign ${campaign.id}`)
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
    await this.email.sendTemplateEmail({
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
