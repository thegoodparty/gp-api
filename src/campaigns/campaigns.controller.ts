import {
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  UsePipes,
} from '@nestjs/common'
import { CampaignsService } from './services/campaigns.service'
import { UpdateCampaignSchema } from './schemas/updateCampaign.schema'
import { CampaignListSchema } from './schemas/campaignList.schema'
import { ZodValidationPipe } from 'nestjs-zod'
import { ReqUser } from '../authentication/decorators/ReqUser.decorator'
import { Campaign, User, UserRole } from '@prisma/client'
import { Roles } from '../authentication/decorators/Roles.decorator'
import { ReqCampaign } from './decorators/ReqCampaign.decorator'
import { UseCampaign } from './decorators/UseCampaign.decorator'
import { userHasRole } from 'src/users/util/users.util'

@Controller('campaigns')
@UsePipes(ZodValidationPipe)
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Roles(UserRole.admin)
  @Get() // campaign/list.js
  findAll(@Query() query: CampaignListSchema) {
    return this.campaignsService.findAll(query)
  }

  @Get('user') // campaign/get.js
  @UseCampaign()
  async findOne(@ReqCampaign() campaign: Campaign) {
    if (!campaign) {
      // guard should prevent this from happening
      throw new NotFoundException()
    }

    return campaign
  }

  @Get('slug/:slug')
  @Roles(UserRole.admin) // campaign/find-by-slug.js
  async findBySlug(@Param('slug') slug: string) {
    const campaign = await this.campaignsService.findOne({ slug })

    if (!campaign) throw new NotFoundException()

    return campaign
  }

  @Post() // campaign/create.js
  async create(@ReqUser() user: User) {
    // see if the user already has campaign
    const existing = await this.campaignsService.findByUser(user.id)
    if (existing) {
      throw new ConflictException('User campaign already exists.')
    }
    return await this.campaignsService.create(user)
  }

  @Put('user') // campaign/update.js
  @UseCampaign({ continueIfNotFound: true })
  async update(
    @ReqUser() user: User,
    @ReqCampaign() campaign: Campaign,
    @Body() { slug, ...body }: UpdateCampaignSchema,
  ) {
    if (
      typeof slug === 'string' &&
      campaign?.slug !== slug &&
      userHasRole(user, [UserRole.admin, UserRole.sales])
    ) {
      // if user has Admin or Sales role, allow loading campaign by slug param
      campaign = await this.campaignsService.findOne({ slug })
    }

    if (!campaign) throw new NotFoundException()

    return this.campaignsService.updateJsonFields(campaign.id, body)
  }
}
