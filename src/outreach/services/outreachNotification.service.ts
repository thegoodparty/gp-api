import { Injectable } from '@nestjs/common'
import { Campaign, OutreachType, User } from '@prisma/client'
import { PinoLogger } from 'nestjs-pino'
import sanitizeHtml from 'sanitize-html'
import TurndownService from 'turndown'
import { CampaignsService } from 'src/campaigns/services/campaigns.service'
import { CrmCampaignsService } from 'src/campaigns/services/crmCampaigns.service'
import {
  WEBAPP_API_PATH,
  WEBAPP_ROOT,
} from 'src/shared/util/appEnvironment.util'
import { SlackService } from 'src/vendors/slack/services/slack.service'
import {
  SlackChannel,
  SlackMessage,
  SlackMessageType,
} from 'src/vendors/slack/slackService.types'
import { getPeerlyJobUrl } from 'src/vendors/peerly/utils/peerlyJobUrl.util'
import {
  AudienceSlackBlock,
  buildSlackBlocks,
} from 'src/voters/util/voterOutreach.util'
import { VoterFileFilterService } from 'src/voters/services/voterFileFilter.service'
import { VOTER_FILE_ROUTE } from 'src/voters/voterFile/voterFile.constants'
import { CreateOutreachSchema } from '../schemas/createOutreachSchema'
import { OutreachWithVoterFileFilter } from '../types/outreach.types'
import { OutreachStep } from '../types/outreachStepError'

const turndownService = new TurndownService()

// IS_PROD can't be used here: the Dockerfile hardcodes NODE_ENV=production for
// every deploy (qa, dev, prod), so it's effectively always true. OTEL_SERVICE_ENVIRONMENT
// is set per-deploy in deploy/index.ts and is the reliable signal.
const TARGET_CHANNEL =
  process.env.OTEL_SERVICE_ENVIRONMENT === 'prod'
    ? SlackChannel.botPolitics
    : SlackChannel.botDev

/**
 * Outreach types that warrant a CAS notification. Door-knocking, phone-banking,
 * and social-media outreach are self-service flows where CAS has no role —
 * those keep their pre-merge silent behavior.
 */
const NOTIFIABLE_TYPES: ReadonlySet<string> = new Set<string>([
  OutreachType.p2p,
  OutreachType.text,
  OutreachType.robocall,
])

export const shouldNotifyCAS = (type?: OutreachType | string): boolean =>
  typeof type === 'string' && NOTIFIABLE_TYPES.has(type)

interface NotifySuccessParams {
  user: User
  campaign: Campaign
  outreach: OutreachWithVoterFileFilter
  audienceRequest?: string
  campaignPlanDueDate?: string
}

interface NotifyFailureParams {
  user: User
  campaign?: Campaign
  createOutreachDto?: Partial<CreateOutreachSchema>
  step: OutreachStep
  error: unknown
}

type Audience = Awaited<
  ReturnType<VoterFileFilterService['voterFileFilterToAudience']>
>

@Injectable()
export class OutreachNotificationService {
  constructor(
    private readonly slack: SlackService,
    private readonly campaignsService: CampaignsService,
    private readonly crmCampaigns: CrmCampaignsService,
    private readonly voterFileFilterService: VoterFileFilterService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(OutreachNotificationService.name)
  }

  async notifySuccess({
    user,
    campaign,
    outreach,
    audienceRequest,
    campaignPlanDueDate,
  }: NotifySuccessParams): Promise<void> {
    if (!shouldNotifyCAS(outreach.outreachType)) return

    const audience: Partial<Audience> = outreach.voterFileFilter
      ? await this.voterFileFilterService.voterFileFilterToAudience(
          outreach.voterFileFilter,
        )
      : {}

    const { aiContent = {} } = campaign
    // For new P2P records, outreach.script holds resolved content. For legacy
    // records, look up the key in aiContent.
    const aiGeneratedScriptContent =
      typeof outreach.script === 'string'
        ? aiContent[outreach.script]?.content
        : undefined
    const script = turndownService.turndown(
      sanitizeHtml(aiGeneratedScriptContent || outreach.script || ''),
    )

    const voterFileUrl = this.buildVoterFileUrl({
      audience,
      type: outreach.outreachType,
      campaignSlug: campaign.slug,
    })

    const peerlyJobUrl = outreach.projectId
      ? getPeerlyJobUrl(outreach.projectId)
      : undefined

    const { hubspotId: crmCompanyId } = campaign.data ?? {}
    const assignedPa = crmCompanyId
      ? await this.crmCampaigns.getCrmCompanyOwnerName(crmCompanyId)
      : ''

    try {
      await this.slack.message(
        buildSlackBlocks({
          name: `${(user.firstName || '').trim()} ${(user.lastName || '').trim()}`,
          email: user.email,
          ...(user.phone ? { phone: user.phone } : {}),
          assignedPa,
          crmCompanyId,
          voterFileUrl,
          type: outreach.outreachType,
          date: outreach.date ?? undefined,
          script,
          ...(outreach.imageUrl ? { imageUrl: outreach.imageUrl } : {}),
          message: outreach.message ? sanitizeHtml(outreach.message) : '',
          formattedAudience: this.formatAudienceFiltersForSlack(audience),
          audienceRequest,
          peerlyJobUrl,
          campaignPlanDueDate,
        }),
        TARGET_CHANNEL,
      )
    } catch (err) {
      this.logger.error(
        { err, outreachId: outreach.id, campaignId: campaign.id },
        'CAS success Slack message failed',
      )
    }

    try {
      await this.campaignsService.update({
        where: { id: campaign.id },
        data: {
          data: {
            ...campaign.data,
            textCampaignCount: (campaign.data.textCampaignCount || 0) + 1,
          },
        },
      })
    } catch (err) {
      this.logger.error(
        { err, campaignId: campaign.id },
        'textCampaignCount increment failed',
      )
    }
  }

  async notifyFailure({
    user,
    campaign,
    createOutreachDto,
    step,
    error,
  }: NotifyFailureParams): Promise<void> {
    if (!shouldNotifyCAS(createOutreachDto?.outreachType)) return

    const errorMessage =
      error instanceof Error ? error.message : String(error ?? 'Unknown error')
    const truncatedError =
      errorMessage.length > 500
        ? `${errorMessage.slice(0, 500)}…`
        : errorMessage

    const scriptPreview =
      typeof createOutreachDto?.script === 'string' &&
      createOutreachDto.script.length > 0
        ? createOutreachDto.script.slice(0, 200)
        : 'None'

    const dateText = createOutreachDto?.date
      ? String(createOutreachDto.date)
      : 'Not provided'
    const outreachTypeText = createOutreachDto?.outreachType
      ? String(createOutreachDto.outreachType)
      : 'Unknown'

    const blocks: SlackMessage = {
      blocks: [
        {
          type: SlackMessageType.HEADER,
          text: {
            type: SlackMessageType.PLAIN_TEXT,
            text: '🚨 Campaign Schedule FAILED 🚨',
            emoji: true,
          },
        },
        {
          type: SlackMessageType.SECTION,
          text: {
            type: SlackMessageType.MRKDWN,
            text:
              `*Candidate/User*\n` +
              `• Name: ${(user.firstName || '').trim()} ${(user.lastName || '').trim()}\n` +
              `• Email: ${user.email ?? 'unknown'}\n` +
              `• Phone: ${user.phone ?? 'unknown'}`,
          },
        },
        {
          type: SlackMessageType.SECTION,
          text: {
            type: SlackMessageType.MRKDWN,
            text:
              `*Attempted Campaign*\n` +
              `• Campaign: ${campaign?.slug ?? 'unknown'}\n` +
              `• Campaign Type: ${outreachTypeText}\n` +
              `• Scheduled Date: ${dateText}`,
          },
        },
        {
          type: SlackMessageType.SECTION,
          text: {
            type: SlackMessageType.MRKDWN,
            text:
              `*Failure*\n` +
              `• Step: \`${step}\`\n` +
              `• Error: ${truncatedError}`,
          },
        },
        {
          type: SlackMessageType.SECTION,
          text: {
            type: SlackMessageType.MRKDWN,
            text:
              `*Script preview*\n${scriptPreview}\n\n` +
              `_No Peerly job was created — this campaign was not scheduled._`,
          },
        },
      ],
    }

    await this.slack.message(blocks, TARGET_CHANNEL)
  }

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
            style: { bold: true },
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
    audience: Partial<Audience>
    type: OutreachType
    campaignSlug: string
  }): string {
    const audienceFilters = Object.entries(audience).reduce<string[]>(
      (acc, [k, v]) => (v ? [...acc, k] : acc),
      [],
    )
    const params = new URLSearchParams({ type, slug: campaignSlug })
    if (audienceFilters.length > 0) {
      params.set('customFilters', JSON.stringify({ filters: audienceFilters }))
    }
    return `${WEBAPP_ROOT}${WEBAPP_API_PATH}${VOTER_FILE_ROUTE}?${params.toString()}`
  }
}
