import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Put,
  UsePipes,
  UseInterceptors,
  ForbiddenException,
  Query,
} from '@nestjs/common'
import { WebsitesService } from '../services/websites.service'
import { Campaign, DomainStatus, User, WebsiteStatus } from '@prisma/client'
import { ReqCampaign } from 'src/campaigns/decorators/ReqCampaign.decorator'
import { UseCampaign } from 'src/campaigns/decorators/UseCampaign.decorator'
import { CampaignWith } from 'src/campaigns/campaigns.types'
import { ReqUser } from 'src/authentication/decorators/ReqUser.decorator'
import { PublicAccess } from 'src/authentication/decorators/PublicAccess.decorator'
import { ContactFormSchema } from '../schemas/ContactForm.schema'
import { ZodValidationPipe } from 'nestjs-zod'
import { FilesInterceptor } from 'src/files/interceptors/files.interceptor'
import { ReqFiles } from 'src/files/decorators/ReqFiles.decorator'
import { FileUpload } from 'src/files/files.types'
import { MimeTypes } from 'http-constants-ts'
import { UpdateWebsiteSchema } from '../schemas/UpdateWebsite.schema'
import { FilesService } from 'src/files/files.service'
import { merge } from 'es-toolkit'
import { WebsiteContactsService } from '../services/websiteContacts.service'
import { GetWebsiteContactsSchema } from '../schemas/GetWebsiteContacts.schema'
import { ValidateVanityPathSchema } from '../schemas/ValidateVanityPath.schema'
import { WebsiteViewsService } from '../services/websiteViews.service'
import { TrackWebsiteViewSchema } from '../schemas/TrackWebsiteView.schema'
import { GetWebsiteViewsSchema } from '../schemas/GetWebsiteViews.schema'
import { CampaignsService } from 'src/campaigns/services/campaigns.service'
import { AnalyticsService } from 'src/analytics/analytics.service'
import { EVENTS } from 'src/vendors/segment/segment.types'
import { PinoLogger } from 'nestjs-pino'
import { ClerkUserEnricherService } from '@/vendors/clerk/services/clerk-user-enricher.service'
import { ResponseSchema } from '@/shared/decorators/ResponseSchema.decorator'
import { McpTool } from '@/mcp/decorators/McpTool.decorator'
import { MyWebsiteResponseSchema } from '../schemas/WebsiteResponse.schema'
import { VerifyLiveResponseSchema } from '../schemas/VerifyLive.schema'
import { serializeWebsiteWithDomain } from '../util/serializeWebsite.util'

const PUBLISHABLE_DOMAIN_STATUSES: DomainStatus[] = [
  DomainStatus.submitted,
  DomainStatus.registered,
  DomainStatus.active,
]

const LOGO_FIELDNAME = 'logoFile'
const HERO_FIELDNAME = 'heroFile'
const WEBSITE_CONTENT_INCLUDES = {
  campaign: {
    select: {
      details: true,
      user: {
        select: {
          clerkId: true,
          firstName: true,
          lastName: true,
        },
      },
    },
  },
}

const isNonEmpty = (value: string | undefined | null) =>
  typeof value === 'string' && value.trim().length > 0

type WebsiteIssueForPublish = {
  title?: string | null
  description?: string | null
}

const isIssueReadyToPublish = (
  issue: WebsiteIssueForPublish,
): issue is { title: string; description: string } =>
  isNonEmpty(issue.title) && isNonEmpty(issue.description)

const REQUIRED_PUBLISH_FIELDS: Array<{
  path: string
  check: (content: PrismaJson.WebsiteContent) => boolean
}> = [
  { path: 'main.title', check: (c) => isNonEmpty(c.main?.title) },
  { path: 'about.bio', check: (c) => isNonEmpty(c.about?.bio) },
  {
    path: 'about.issues',
    check: (c) =>
      Array.isArray(c.about?.issues) &&
      c.about.issues.length > 0 &&
      c.about.issues.every(
        (issue) =>
          typeof issue === 'object' &&
          issue !== null &&
          isIssueReadyToPublish(issue as WebsiteIssueForPublish),
      ),
  },
  { path: 'contact.address', check: (c) => isNonEmpty(c.contact?.address) },
  { path: 'contact.email', check: (c) => isNonEmpty(c.contact?.email) },
  { path: 'contact.phone', check: (c) => isNonEmpty(c.contact?.phone) },
]

const assertReadyToPublish = (content: PrismaJson.WebsiteContent) => {
  const missing = REQUIRED_PUBLISH_FIELDS.filter(
    ({ check }) => !check(content),
  ).map(({ path }) => path)
  if (missing.length > 0) {
    throw new BadRequestException(
      `Website content is missing required fields for publishing: ${missing.join(', ')}`,
    )
  }
}

@Controller('websites')
@UsePipes(ZodValidationPipe)
export class WebsitesController {
  constructor(
    private readonly websites: WebsitesService,
    private readonly contacts: WebsiteContactsService,
    private readonly files: FilesService,
    private readonly siteViews: WebsiteViewsService,
    private readonly campaigns: CampaignsService,
    private readonly analytics: AnalyticsService,
    private readonly clerkEnricher: ClerkUserEnricherService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(WebsitesController.name)
  }

  @Post()
  @UseCampaign({
    include: {
      campaignPositions: {
        include: {
          topIssue: true,
        },
      },
    },
  })
  createWebsite(
    @ReqUser() user: User,
    @ReqCampaign() campaign: CampaignWith<'campaignPositions'>,
  ) {
    return this.websites.createByCampaign(user, campaign)
  }

  @Get('mine')
  @UseCampaign()
  @ResponseSchema(MyWebsiteResponseSchema)
  @McpTool({
    description:
      "Read the calling campaign's website, including current content " +
      '(main, about, contact sections) and the attached custom domain ' +
      '(if any) with its registration status. Call before merging ' +
      'updates so the agent can preserve fields it does not intend to ' +
      'change. Returns the Website row with `domain` populated when ' +
      'a custom domain has been purchased; `domain` is null otherwise. ' +
      'Read-only; safe to retry.',
  })
  async getMyWebsite(@ReqCampaign() { id: campaignId }: Campaign) {
    const website = await this.websites.findUniqueOrThrow({
      where: { campaignId },
      include: { domain: true },
    })
    return serializeWebsiteWithDomain(website)
  }

  @Get('mine/contacts')
  @UseCampaign()
  async getMyWebsiteContacts(
    @ReqCampaign() { id: campaignId }: Campaign,
    @Query()
    {
      sortBy,
      sortOrder = 'desc',
      limit = 25,
      page = 1,
    }: GetWebsiteContactsSchema,
  ) {
    const offset = (page - 1) * limit
    const website = await this.websites.findUniqueOrThrow({
      where: { campaignId },
    })

    const [contacts, total] = await Promise.all([
      this.contacts.findMany({
        where: { websiteId: website.id },
        take: limit,
        skip: offset,
        ...(sortBy ? { orderBy: { [sortBy]: sortOrder } } : {}),
      }),
      this.contacts.count({
        where: { websiteId: website.id },
      }),
    ])

    return {
      contacts,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    }
  }

  @Get('mine/views')
  @UseCampaign()
  async getMyWebsiteViews(
    @ReqCampaign() { id: campaignId }: Campaign,
    @Query() { startDate, endDate }: GetWebsiteViewsSchema,
  ) {
    const website = await this.websites.findUniqueOrThrow({
      where: { campaignId },
    })

    return this.siteViews.getWebsiteViews(website.id, startDate, endDate)
  }

  @Put('mine')
  @UseCampaign()
  @ResponseSchema(MyWebsiteResponseSchema)
  @McpTool({
    description:
      "Update the calling campaign's website content and optionally " +
      'publish it. The body deep-merges into Website.content; pass only ' +
      'fields you want to change. To publish, send `status: "published"` ' +
      '— this requires (1) the required content sections (main.title, ' +
      'about.bio, about.issues with title+description, contact.address, ' +
      'contact.email, contact.phone) to be present, and (2) a custom ' +
      'domain attached to the website with Domain.status of `submitted`, ' +
      '`registered`, or `active`. Calling with `status: "published"` ' +
      'without an attached domain (or with the domain still `pending` / ' +
      '`inactive`) returns 400. After a successful publish call, poll ' +
      '`POST /v1/websites/mine/verify-live` to confirm the live URL ' +
      'serves the rendered site with required TCR sections.',
  })
  @UseInterceptors(
    FilesInterceptor([LOGO_FIELDNAME, HERO_FIELDNAME], {
      mode: 'buffer',
      numFiles: 2,
      mimeTypes: [
        MimeTypes.IMAGE_JPEG,
        MimeTypes.IMAGE_PNG,
        MimeTypes.IMAGE_GIF,
      ],
    }),
  )
  async updateWebsite(
    @ReqUser() user: User,
    @ReqCampaign() { id: campaignId }: Campaign,
    @Body() body: UpdateWebsiteSchema,
    @ReqFiles() files?: FileUpload[],
  ) {
    const logoFile = files?.find((file) => file.fieldname === LOGO_FIELDNAME)
    const heroFile = files?.find((file) => file.fieldname === HERO_FIELDNAME)

    const {
      content: currentContent,
      hasEverBeenPublished,
      domain,
    } = await this.websites.findUniqueOrThrow({
      where: { campaignId },
      select: {
        content: true,
        hasEverBeenPublished: true,
        domain: { select: { status: true } },
      },
    })

    if (body.status === WebsiteStatus.published) {
      if (!domain) {
        throw new BadRequestException(
          'Cannot publish: no custom domain is attached to this website.',
        )
      }
      if (!PUBLISHABLE_DOMAIN_STATUSES.includes(domain.status)) {
        throw new BadRequestException(
          `Cannot publish: attached domain is in status "${domain.status}". ` +
            'Domain must reach status `submitted` or later before publish.',
        )
      }
    }

    const updatedContent: PrismaJson.WebsiteContent = merge(
      currentContent || {},
      body,
    )

    if (body.about?.issues !== undefined) {
      updatedContent.about = updatedContent.about || {}
      updatedContent.about.issues = body.about.issues
    }

    if (body.status === WebsiteStatus.published) {
      assertReadyToPublish(updatedContent)
    }

    const isFirstPublish =
      body.status === WebsiteStatus.published && !hasEverBeenPublished

    const [logo, hero] = await Promise.all([
      logoFile ? this.files.uploadFile(logoFile, 'uploads') : null,
      heroFile ? this.files.uploadFile(heroFile, 'uploads') : null,
    ])

    if (logo) {
      updatedContent.logo = logo
    } else if (body.logo === 'null') {
      updatedContent.logo = undefined
    }

    if (hero) {
      updatedContent.main ||= {}
      updatedContent.main.image = hero
    } else if (body.main?.image === 'null') {
      updatedContent.main ||= {}
      updatedContent.main.image = undefined
    }

    const result = await this.websites.update({
      where: { campaignId },
      data: {
        content: updatedContent,
        ...(body.vanityPath !== undefined && {
          vanityPath: body.vanityPath.toLowerCase(),
        }),
        ...(body.status !== undefined && {
          status: body.status,
        }),
        ...(isFirstPublish && {
          hasEverBeenPublished: true,
        }),
      },
      include: {
        domain: true,
      },
    })

    // We only want to trigger this event when the website is first published.
    // This is because we want the 10DLC actions for HubSpot to happen sequentially.
    // We don't want to reset users back to a previous step if they unpublished and then republished their
    // GoodParty website. We don't care oh so much about the GoodParty website and might remove it in the future.
    if (isFirstPublish) {
      try {
        await this.analytics.track(user.id, EVENTS.CandidateWebsite.Published)
      } catch (e) {
        this.logger.error(
          { e },
          `Failed to track website published event for user ${user.id}`,
        )
      }
    }

    return serializeWebsiteWithDomain(result)
  }

  @Post('mine/verify-live')
  @UseCampaign()
  @HttpCode(HttpStatus.OK)
  @ResponseSchema(VerifyLiveResponseSchema)
  @McpTool({
    description:
      "Verify that the calling campaign's website is live and contains " +
      'the sections TCR / Peerly look for during 10DLC review. ' +
      'Single-shot fetch of `https://<attached-domain>/` — does NOT ' +
      'retry. If the live URL is not reachable yet (DNS not propagated, ' +
      'site not deployed), `checks.http_200` will be false; the caller ' +
      'is responsible for backoff via `next_action.wait_*` and the ' +
      'recovery loop. Returns `{ verified, url, checks: { http_200, ' +
      'has_privacy_policy, has_terms, has_candidate_identity } }`. ' +
      'Requires an attached custom domain; returns 400 if no domain is ' +
      'attached. Call AFTER `PUT /v1/websites/mine` with ' +
      '`status: "published"` has succeeded.',
  })
  verifyLive(@ReqCampaign() { id: campaignId }: Campaign) {
    return this.websites.verifyLive(campaignId)
  }

  @Post('validate-vanity-path')
  @UseCampaign()
  async validateVanityPath(
    @ReqCampaign() { id: campaignId }: Campaign,
    @Body() body: ValidateVanityPathSchema,
  ) {
    const website = await this.websites.findUnique({
      where: { vanityPath: body.vanityPath, NOT: { campaignId } },
    })

    return {
      available: !website,
    }
  }

  @Get(':vanityPath/view')
  @PublicAccess()
  async viewWebsite(@Param('vanityPath') vanityPath: string) {
    const website = await this.websites.findUniqueOrThrow({
      where: { vanityPath },
      include: WEBSITE_CONTENT_INCLUDES,
    })

    if (website.status !== WebsiteStatus.published) {
      throw new ForbiddenException()
    }

    if (website.campaign?.user) {
      website.campaign.user = await this.clerkEnricher.enrichUser(
        website.campaign.user,
      )
    }

    return website
  }

  @Post(':vanityPath/contact-form')
  @PublicAccess()
  async contactForm(
    @Param('vanityPath') vanityPath: string,
    @Body() body: ContactFormSchema,
  ) {
    const website = await this.websites.findUniqueOrThrow({
      where: { vanityPath },
    })

    if (website.status !== WebsiteStatus.published) {
      throw new ForbiddenException()
    }

    return await this.contacts.create(website.id, body)
  }

  @Post(':vanityPath/track-view')
  @PublicAccess()
  async trackWebsiteView(
    @Param('vanityPath') vanityPath: string,
    @Body() { visitorId }: TrackWebsiteViewSchema,
  ) {
    const website = await this.websites.findUniqueOrThrow({
      where: { vanityPath },
    })

    return this.siteViews.trackWebsiteView(website.id, visitorId)
  }

  // this is used from candidates.goodparty.org
  @Get('by-domain/:domain')
  @PublicAccess()
  async getWebsiteByDomain(@Param('domain') domain: string) {
    const websiteId = await this.websites.getWebsiteIdByDomain(domain)
    const website = await this.websites.findUnique({
      where: { id: websiteId },
      include: WEBSITE_CONTENT_INCLUDES,
    })
    if (!website || website.status !== WebsiteStatus.published) {
      throw new NotFoundException()
    }
    if (website.campaign?.user) {
      website.campaign.user = await this.clerkEnricher.enrichUser(
        website.campaign.user,
      )
    }
    return website
  }
}
