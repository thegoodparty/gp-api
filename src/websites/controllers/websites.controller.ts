import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  UsePipes,
  UseInterceptors,
  Logger,
  ForbiddenException,
  Query,
} from '@nestjs/common'
import { WebsitesService } from '../services/websites.service'
import { Campaign, User, UserRole, WebsiteStatus } from '@prisma/client'
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
import { userHasRole } from 'src/users/util/users.util'
import { WebsiteContactsService } from '../services/websiteContacts.service'
import { GetWebsiteContactsSchema } from '../schemas/GetWebsiteContacts.schema'
import { ValidateVanityPathSchema } from '../schemas/ValidateVanityPath.schema'
import { WebsiteViewsService } from '../services/websiteViews.service'
import { TrackWebsiteViewSchema } from '../schemas/TrackWebsiteView.schema'
import { GetWebsiteViewsSchema } from '../schemas/GetWebsiteViews.schema'

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
      },
    })

    const updatedContent: PrismaJson.WebsiteContent = merge(
      currentContent || {},
      body,
    )

    // Handle array replacement for about.issues to prevent merging
    if (body.about?.issues) {
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

  @Get(':vanityPath/preview')
  @UseCampaign()
  async previewWebsite(
    @ReqUser() user: User,
    @ReqCampaign() campaign: Campaign,
    @Param('vanityPath') vanityPath: string,
  ) {
    const website = await this.websites.findUniqueOrThrow({
      where: { vanityPath },
      include: WEBSITE_CONTENT_INCLUDES,
    })

    if (
      website.campaignId !== campaign.id &&
      !userHasRole(user, UserRole.admin)
    ) {
      throw new ForbiddenException(
        'You are not authorized to preview this website',
      )
    }

    return website
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
}
