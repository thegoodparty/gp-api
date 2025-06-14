import { Injectable } from '@nestjs/common'
import { SlackService } from 'src/shared/services/slack.service'
import { Campaign, OutreachType, User } from '@prisma/client'
import {
  AudienceSlackBlock,
  buildSlackBlocks,
} from '../util/voterOutreach.util'
import { CampaignsService } from 'src/campaigns/services/campaigns.service'
import sanitizeHtml from 'sanitize-html'
import {
  IS_PROD,
  WEBAPP_API_PATH,
  WEBAPP_ROOT,
} from 'src/shared/util/appEnvironment.util'
import { VOTER_FILE_ROUTE } from '../voterFile/voterFile.controller'
import {
  SlackChannel,
  SlackMessageType,
} from 'src/shared/services/slackService.types'
import { CrmCampaignsService } from '../../campaigns/services/crmCampaigns.service'
import { getUserFullName } from 'src/users/util/users.util'
import { EmailService } from 'src/email/email.service'
import { EmailTemplateName } from 'src/email/email.types'
import { VoterFileFilterService } from './voterFileFilter.service'
import { OutreachWithVoterFileFilter } from '../../outreach/types/outreach.types'

export interface OutreachSlackBlocksConfiguration {
  user: User
  campaign: Campaign
  type: OutreachType
  date: Date
  voterFileUrl: string
  script: string
  imageUrl?: string | null
  message?: string
  formattedAudience?: AudienceSlackBlock[]
  audienceRequest: string
}

export type Audience = {
  audience_superVoters?: boolean | null
  audience_likelyVoters?: boolean | null
  audience_unreliableVoters?: boolean | null
  audience_unlikelyVoters?: boolean | null
  audience_firstTimeVoters?: boolean | null
  party_independent?: boolean | null
  party_democrat?: boolean | null
  party_republican?: boolean | null
  age_18_25?: boolean | null
  age_25_35?: boolean | null
  age_35_50?: boolean | null
  age_50_plus?: boolean | null
  gender_male?: boolean | null
  gender_female?: boolean | null
}

@Injectable()
export class VoterOutreachService {
  constructor(
    private readonly slack: SlackService,
    private readonly campaignsService: CampaignsService,
    private readonly crmCampaigns: CrmCampaignsService,
    private readonly email: EmailService,
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
    audience: Audience
    type: OutreachType
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

  // TODO: move this out to the OutreachService
  async scheduleOutreachCampaign(
    user: User,
    campaign: Campaign,
    outreach: OutreachWithVoterFileFilter,
  ) {
    const audience =
      await this.voterFileFilterService.voterFileFilterToAudience(
        outreach.voterFileFilter!,
      )

    const voterFileUrl = this.buildVoterFileUrl({
      audience,
      type: outreach.outreachType,
      campaignSlug: campaign.slug,
    })

    await this.sendSlackOutreachMessage({
      user,
      campaign,
      type: outreach.outreachType,
      date: outreach.date!,
      voterFileUrl,
      script: outreach.script!,
      imageUrl: outreach.imageUrl,
      message: outreach.message ? sanitizeHtml(outreach.message) : '',
      formattedAudience: this.formatAudienceFiltersForSlack(audience),
      audienceRequest: audience['audience_request'] || '', // TODO: test to see if the this shit works
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

    this.sendSubmittedEmail(user, outreach.message!, outreach.date!)

    return outreach ? outreach : true
  }

  // TODO: move this out to the OutreachService
  private async sendSlackOutreachMessage({
    user: { firstName, lastName, email, phone },
    campaign: { data: { hubspotId: crmCompanyId } = {} },
    type,
    date,
    voterFileUrl,
    script,
    imageUrl = null,
    message = '',
    formattedAudience = [],
    audienceRequest = '',
  }: OutreachSlackBlocksConfiguration) {
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
        date,
        script,
        ...(imageUrl ? { imageUrl } : {}),
        message,
        formattedAudience,
        audienceRequest,
      }),
      IS_PROD ? SlackChannel.botPolitics : SlackChannel.botDev,
    )
  }

  // TODO: move this out to the OutreachService
  async sendSubmittedEmail(user: User, message: string = 'N/A', date: Date) {
    await this.email.sendTemplateEmail({
      to: user.email,
      subject: 'Your Texting Campaign is Scheduled - Next Steps Inside',
      template: EmailTemplateName.textCampaignSubmitted,
      variables: {
        name: getUserFullName(user),
        message,
        scheduledDate: date.toLocaleDateString(),
      },
    })
  }
}
