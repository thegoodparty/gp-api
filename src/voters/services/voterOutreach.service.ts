import { Injectable, Logger, StreamableFile } from '@nestjs/common'
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
import { PeerlyPhoneListService } from '../../peerly/services/peerlyPhoneList.service'
import { PeerlyMediaService } from '../../peerly/services/peerlyMedia.service'
import { PeerlyP2pSmsService } from '../../peerly/services/peerlyP2pSms.service'
import { VoterFileService } from '../voterFile/voterFile.service'
import { CampaignWith } from '../../campaigns/campaigns.types'
import { VoterFileType } from '../voterFile/voterFile.types'
import { Readable } from 'stream'

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
  voterFileParams: {
    type: VoterFileType
    customFilters?: any
    selectedColumns?: Array<{ db: string; label?: string }>
    limit?: number
  }
}

interface P2pCampaignResult {
  jobId: string
  listId: number
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
    private readonly phoneListService: PeerlyPhoneListService,
    private readonly mediaService: PeerlyMediaService,
    private readonly p2pSmsService: PeerlyP2pSmsService,
    private readonly voterFileService: VoterFileService,
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
      audienceRequest,
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

  private async createP2pCampaign(
    params: CreateP2pCampaignParams,
  ): Promise<P2pCampaignResult> {
    const {
      campaign,
      jobName,
      messageTemplates,
      didState,
      identityId,
      voterFileParams,
    } = params

    try {
      // Step 1: Upload media files if present
      const templateMediaMap = new Map<number, string>()
      for (let i = 0; i < messageTemplates.length; i++) {
        const template = messageTemplates[i]
        if (template.mediaStream) {
          this.logger.log(`Uploading media for template: ${template.title}`)
          const mediaId = await this.mediaService.createMedia({
            identityId: identityId || campaign.id.toString(),
            fileStream: template.mediaStream.stream,
            fileName: template.mediaStream.fileName,
            mimeType: template.mediaStream.mimeType,
            fileSize: template.mediaStream.fileSize,
          })
          templateMediaMap.set(i, mediaId)
        }
      }

      // Step 2: Generate and upload phone list
      this.logger.log('Generating voter CSV...')
      const csvResult = await this.voterFileService.getCsvOrCount(campaign, {
        ...voterFileParams,
        countOnly: false,
      })

      // Extract the stream from StreamableFile
      let csvStream: Readable
      if (csvResult instanceof StreamableFile) {
        csvStream = csvResult.getStream() as Readable
      } else {
        throw new Error('Expected StreamableFile from voter file service')
      }

      this.logger.log('Uploading phone list...')
      const listStatus = await this.phoneListService.uploadPhoneList({
        listName: `${jobName} - ${new Date().toISOString()}`,
        csvStream,
        identityId,
      })

      const listId = listStatus.Data.list_id
      if (!listId) {
        throw new Error('Phone list upload failed - no list_id returned')
      }

      // Step 4: Create P2P job with templates
      this.logger.log('Creating P2P job...')
      const templates = messageTemplates.map((template, index) => {
        const mediaId = templateMediaMap.get(index)
        return {
          title: template.title,
          text: template.text,
          ...(mediaId && template.mediaStream && {
            advanced: {
              media: {
                media_id: mediaId,
                media_type: template.mediaStream.mimeType.startsWith('video/')
                  ? ('VIDEO' as const)
                  : ('IMAGE' as const),
              },
            },
          }),
        }
      })

      const jobId = await this.p2pSmsService.createJob({
        name: jobName,
        templates,
        didState,
        identityId,
      })

      // Step 5: Assign list to job
      this.logger.log('Assigning phone list to job...')
      await this.p2pSmsService.assignListToJob(jobId, listId)

      this.logger.log(
        `P2P campaign created successfully. Job ID: ${jobId}, List ID: ${listId}`,
      )

      return {
        jobId,
        listId,
        mediaIds: Array.from(templateMediaMap.values()),
      }
    } catch (error) {
      this.logger.error('Failed to create P2P campaign:', error)
      throw error
    }
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
