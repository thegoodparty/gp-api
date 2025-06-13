import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  UsePipes,
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

@Controller('websites')
@UsePipes(ZodValidationPipe)
export class WebsitesController {
  constructor(private readonly websites: WebsitesService) {}

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
    })
  }

  @Put('mine')
  @UseCampaign()
  updateMyWebsite(
    @ReqCampaign() { id: campaignId }: Campaign,
    @Body() data: any,
  ) {
    return this.websites.update({
      where: { campaignId },
      data,
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
