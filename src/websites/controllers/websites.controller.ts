import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Logger,
  Param,
  Post,
  Put,
  Query,
  UseInterceptors,
  UsePipes,
} from '@nestjs/common'
import { Campaign, User, WebsiteStatus } from '@prisma/client'
import { merge } from 'es-toolkit'
import { MimeTypes } from 'http-constants-ts'
import { ZodValidationPipe } from 'nestjs-zod'
import { PublicAccess } from 'src/authentication/decorators/PublicAccess.decorator'
import { ReqUser } from 'src/authentication/decorators/ReqUser.decorator'
import { CampaignWith } from 'src/campaigns/campaigns.types'
import { ReqCampaign } from 'src/campaigns/decorators/ReqCampaign.decorator'
import { UseCampaign } from 'src/campaigns/decorators/UseCampaign.decorator'
import { CampaignsService } from 'src/campaigns/services/campaigns.service'
import { ReqFiles } from 'src/files/decorators/ReqFiles.decorator'
import { FilesService } from 'src/files/files.service'
import { FileUpload } from 'src/files/files.types'
import { FilesInterceptor } from 'src/files/interceptors/files.interceptor'
import { ContactFormSchema } from '../schemas/ContactForm.schema'
import { GetWebsiteContactsSchema } from '../schemas/GetWebsiteContacts.schema'
import { GetWebsiteViewsSchema } from '../schemas/GetWebsiteViews.schema'
import { TrackWebsiteViewSchema } from '../schemas/TrackWebsiteView.schema'
import { UpdateWebsiteSchema } from '../schemas/UpdateWebsite.schema'
import { ValidateVanityPathSchema } from '../schemas/ValidateVanityPath.schema'
import { WebsiteContactsService } from '../services/websiteContacts.service'
import { WebsitesService } from '../services/websites.service'
import { WebsiteViewsService } from '../services/websiteViews.service'

const LOGO_FIELDNAME = 'logoFile'
const HERO_FIELDNAME = 'heroFile'
const WEBSITE_CONTENT_INCLUDES = {
  campaign: {
    select: {
      details: true,
      user: {
        select: {
          firstName: true,
          lastName: true,
        },
      },
    },
  },
}

@Controller('websites')
@UsePipes(ZodValidationPipe)
export class WebsitesController {
  private readonly logger = new Logger(WebsitesController.name)

  constructor(
    private readonly websites: WebsitesService,
    private readonly contacts: WebsiteContactsService,
    private readonly files: FilesService,
    private readonly siteViews: WebsiteViewsService,
    private readonly campaigns: CampaignsService,
  ) {}

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
  getMyWebsite(@ReqCampaign() { id: campaignId }: Campaign) {
    return this.websites.findUniqueOrThrow({
      where: { campaignId },
      include: {
        domain: true,
      },
    })
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
    const website = await this.websites.findUniqueOrThrow({
      where: { campaignId },
    })

    const [contacts, total] = await Promise.all([
      this.contacts.findMany({
        where: { websiteId: website.id },
        orderBy: sortBy ? { [sortBy]: sortOrder } : undefined,
        take: limit,
        skip: (page - 1) * limit,
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
    @ReqCampaign() { id: campaignId }: Campaign,
    @Body() body: UpdateWebsiteSchema,
    @ReqFiles() files?: FileUpload[],
  ) {
    const logoFile = files?.find((file) => file.fieldname === LOGO_FIELDNAME)
    const heroFile = files?.find((file) => file.fieldname === HERO_FIELDNAME)

    const { content: currentContent } = await this.websites.findUniqueOrThrow({
      where: { campaignId },
      select: {
        content: true,
        domain: true,
      },
    })

    const updatedContent: PrismaJson.WebsiteContent = merge(
      currentContent || {},
      body,
    )

    if (body.about?.issues !== undefined) {
      updatedContent.about = updatedContent.about || {}
      updatedContent.about.issues = body.about.issues
    }

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

    return this.websites.update({
      where: { campaignId },
      data: {
        content: updatedContent,
        ...(body.vanityPath !== undefined && {
          vanityPath: body.vanityPath.toLowerCase(),
        }),
        ...(body.status !== undefined && {
          status: body.status,
        }),
      },
      include: {
        domain: true,
      },
    })
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
    return this.websites.findByDomainName(domain, WEBSITE_CONTENT_INCLUDES)
  }
}
