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
} from '@nestjs/common'
import { WebsitesService } from '../services/websites.service'
import { Campaign, User } from '@prisma/client'
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

const LOGO_FIELDNAME = 'logoFile'
const HERO_FIELDNAME = 'heroFile'

@Controller('websites')
@UsePipes(ZodValidationPipe)
export class WebsitesController {
  private readonly logger = new Logger(WebsitesController.name)

  constructor(
    private readonly websites: WebsitesService,
    private readonly files: FilesService,
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

    const [logo, hero] = await Promise.all([
      logoFile ? this.files.uploadFile(logoFile, 'uploads') : null,
      heroFile ? this.files.uploadFile(heroFile, 'uploads') : null,
    ])

    if (logo) {
      updatedContent.logo = logo
    }
    if (hero) {
      updatedContent.main ||= {}
      updatedContent.main.image = hero
    }

    return this.websites.update({
      where: { campaignId },
      data: {
        content: updatedContent,
        ...(body.vanityPath !== undefined && {
          vanityPath: body.vanityPath.toLowerCase(),
        }),
      },
    })
  }

  @Post('contact-form')
  @PublicAccess()
  contactForm(@Body() body: ContactFormSchema) {
    return {
      body,
    }
  }

  @Get('preview/:vanityPath')
  @PublicAccess()
  previewWebsite(@Param('vanityPath') vanityPath: string) {
    return this.websites.findUniqueOrThrow({
      where: { vanityPath },
    })
  }
}
