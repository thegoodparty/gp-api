import { Injectable, Logger } from '@nestjs/common'
import { SlackService } from 'src/shared/services/slack.service'
import {
  Audience,
  ScheduleOutreachCampaignSchema,
} from '../voterFile/schemas/ScheduleOutreachCampaign.schema'
import {
  Campaign,
  Outreach,
  OutreachStatus,
  OutreachType,
  User,
} from '@prisma/client'
import {
  AudienceSlackBlock,
  buildSlackBlocks,
} from '../util/voterOutreach.util'
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
import { VoterFileFilterService } from './voterFileFilter.service'
import { CampaignTaskType } from '../../campaigns/tasks/campaignTasks.types'
import { VoterFileType } from '../voterFile/voterFile.types'

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

  private formatAudienceFiltersForSlack(
    audience: Partial<Audience>,
  ): Array<AudienceSlackBlock> {
    return Object.entries(audience)
      .filter(([key]) => key !== 'audience_request')
      .map(([key, value]) => ({
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
      }))
  }

  private buildVoterFileUrl({
    audience,
    type,
    campaignSlug,
  }: {
    audience: Omit<Audience, 'audience_request'>
    type: CampaignTaskType | VoterFileType
    campaignSlug: string
  }): string {
    const audienceFilters = Object.entries(audience).reduce(
      (acc, [k, v]) => (v ? [...acc, k] : acc),
      [] as string[],
    )

    const encodedFilters = audienceFilters
      ? encodeURIComponent(JSON.stringify({ filters: audienceFilters }))
      : null
    return `${WEBAPP_ROOT}${WEBAPP_API_PATH}${VOTER_FILE_ROUTE}?type=${type}&slug=${campaignSlug}&customFilters=${encodedFilters}`
  }

  async scheduleOutreachCampaign(
    user: User,
    campaign: Campaign,
    {
      budget,
      audience = {},
      script,
      date,
      message,
      voicemail,
      type,
      voterCount,
    }: ScheduleOutreachCampaignSchema,
    imageUpload?: FileUpload,
  ) {
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
    }: Audience = audience as Audience

    const messagingScript: string = campaign.aiContent?.[script]?.content
      ? sanitizeHtml(campaign.aiContent?.[script]?.content, {
          allowedTags: [],
          allowedAttributes: {},
        })
      : script

    const voterFileUrl = this.buildVoterFileUrl({
      audience: audience as Omit<Audience, 'audience_request'>,
      type,
      campaignSlug: campaign.slug,
    })

    // format audience filters for Slack message
    const formattedAudience = this.formatAudienceFiltersForSlack(
      audience as Partial<Audience>,
    )

    // Upload image
    const imageUrl: string | null = imageUpload
      ? await this.filesService.uploadFile(
          imageUpload,
          `scheduled-campaign/${campaign.slug}/${type}/${date}`,
        )
      : null

    const OUTREACH_TYPES: string[] = [
      CampaignTaskType.text,
      CampaignTaskType.robocall,
      CampaignTaskType.doorKnocking,
      CampaignTaskType.phoneBanking,
      CampaignTaskType.socialMedia,
    ]

    let outreach: Outreach | null = null
    if (OUTREACH_TYPES.includes(type)) {
      const name = `${type} Campaign ${new Date(date).toLocaleDateString()}`
      const voterFileFilter = audience
        ? await this.voterFileFilterService.create(campaign.id, {
            name,
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
            voterCount,
          })
        : null

      outreach = await this.outreachService.model.create({
        data: {
          campaignId: campaign.id,
          outreachType: type as OutreachType,
          name,
          message,
          status: OutreachStatus.pending,
          script: messagingScript,
          date: new Date(date),
          imageUrl,
          ...(voterFileFilter && { voterFileFilterId: voterFileFilter.id }),
        },
        include: {
          voterFileFilter: true,
        },
      })

      this.logger.debug(`Scheduled TextCampaign for campaign ${campaign.id}`)
    }

    await this.sendSlackOutreachMessage({
      user,
      campaign,
      type,
      date,
      voterFileUrl,
      budget,
      voicemail,
      script,
      messagingScript,
      imageUrl,
      message: message ? sanitizeHtml(message) : '',
      formattedAudience,
      audienceRequest: audience['audience_request'] || '',
    })

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

    return outreach ? outreach : true
  }

  private async sendSlackOutreachMessage({
    user: { firstName, lastName, email, phone },
    campaign: { data: { hubspotId: crmCompanyId } = {} },
    type,
    date,
    voterFileUrl,
    budget = '0',
    voicemail = false,
    script,
    messagingScript,
    imageUrl = null,
    message = '',
    formattedAudience = [],
    audienceRequest = '',
  }: {
    user: User
    campaign: Campaign
    type: CampaignTaskType | VoterFileType
    date: string
    voterFileUrl: string
    budget?: string
    voicemail?: boolean
    script: string
    messagingScript: string
    imageUrl?: string | null
    message?: string
    formattedAudience?: AudienceSlackBlock[]
    audienceRequest: string
  }) {
    return await this.slack.message(
      buildSlackBlocks({
        name: `${firstName} ${lastName}`,
        email,
        ...(phone ? { phone } : {}),
        assignedPa: crmCompanyId
          ? await this.crmCampaigns.getCrmCompanyOwnerName(crmCompanyId)
          : '',
        crmCompanyId,
        voterFileUrl,
        type,
        budget: Number(budget),
        voicemail,
        date,
        script,
        messagingScript,
        ...(imageUrl ? { imageUrl } : {}),
        message,
        formattedAudience,
        audienceRequest,
      }),
      IS_PROD ? SlackChannel.botPolitics : SlackChannel.botDev,
    )
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
