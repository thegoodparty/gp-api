import { Injectable, Logger } from '@nestjs/common'
import { SlackService } from 'src/vendors/slack/services/slack.service'
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
} from 'src/vendors/slack/slackService.types'
import { CrmCampaignsService } from '../../campaigns/services/crmCampaigns.service'
import { getUserFullName } from 'src/users/util/users.util'
import { EmailService } from 'src/email/email.service'
import { EmailTemplateName } from 'src/email/email.types'
import { VoterFileFilterService } from './voterFileFilter.service'
import { OutreachWithVoterFileFilter } from '../../outreach/types/outreach.types'
import { PeerlyMediaService } from '../../vendors/peerly/services/peerlyMedia.service'
import { PeerlyP2pSmsService } from '../../vendors/peerly/services/peerlyP2pSms.service'
import { getPeerlyJobUrl } from '../../vendors/peerly/utils/peerlyJobUrl.util'
import { CampaignWith } from '../../campaigns/campaigns.types'
import { Readable } from 'stream'
import TurndownService from 'turndown'

const turndownService = new TurndownService()

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
  audienceRequest?: string
  peerlyJobUrl?: string
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

// P2P SMS interfaces
interface CreateP2pCampaignParams {
  campaign: CampaignWith<'pathToVictory'>
  jobName: string
  phoneListId: number
  messageTemplates: Array<{
    title: string
    text: string
    mediaStream?: {
      stream: Readable
      fileName: string
      mimeType: string
      fileSize?: number
    }
  }>
  didState: string
  identityId?: string
}

interface P2pCampaignResult {
  jobId: string
  phoneListId: number
  mediaIds: string[]
}

@Injectable()
export class VoterOutreachService {
  private readonly logger = new Logger(VoterOutreachService.name)
  constructor(
    private readonly slack: SlackService,
    private readonly campaignsService: CampaignsService,
    private readonly crmCampaigns: CrmCampaignsService,
    private readonly email: EmailService,
    private readonly voterFileFilterService: VoterFileFilterService,
    private readonly mediaService: PeerlyMediaService,
    private readonly p2pSmsService: PeerlyP2pSmsService,
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
    audienceRequest?: string,
  ) {
    const { aiContent = {} } = campaign
    const audience =
      await this.voterFileFilterService.voterFileFilterToAudience(
        outreach.voterFileFilter!,
      )

    const { content: aiGeneratedScriptContent } =
      aiContent[outreach.script!] || {}

    const script = turndownService.turndown(
      sanitizeHtml(aiGeneratedScriptContent || outreach.script!),
    )

    const voterFileUrl = this.buildVoterFileUrl({
      audience,
      type: outreach.outreachType,
      campaignSlug: campaign.slug,
    })

    const peerlyJobUrl = outreach.projectId
      ? getPeerlyJobUrl(outreach.projectId)
      : undefined

    await this.sendSlackOutreachMessage({
      user,
      campaign,
      type: outreach.outreachType,
      date: outreach.date!,
      voterFileUrl,
      script,
      imageUrl: outreach.imageUrl,
      message: outreach.message ? sanitizeHtml(outreach.message) : '',
      formattedAudience: this.formatAudienceFiltersForSlack(audience),
      audienceRequest,
      peerlyJobUrl,
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
    peerlyJobUrl,
  }: OutreachSlackBlocksConfiguration) {
    return await this.slack.message(
      buildSlackBlocks({
        name: `${(firstName || '').trim()} ${(lastName || '').trim()}`,
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
        peerlyJobUrl,
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
