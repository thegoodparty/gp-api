import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
  UsePipes,
} from '@nestjs/common'
import { CampaignsService } from './campaigns.service'
import { UpdateCampaignSchema } from './schemas/updateCampaign.schema'
import { CreateCampaignSchema } from './schemas/createCampaign.schema'
import { CampaignListSchema } from './schemas/campaignList.schema'
import { ZodValidationPipe } from 'nestjs-zod'
import { ReqUser } from '../authentication/decorators/ReqUser.decorator'
import { User } from '@prisma/client'
import { CampaignOwnersOrAdminGuard } from './guards/CampaignOwnersOrAdmin.guard'
import { Roles } from '../authentication/decorators/Roles.decorator'

@Controller('campaigns')
@UsePipes(ZodValidationPipe)
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Roles('admin')
  @Get()
  findAll(@Query() query: CampaignListSchema) {
    return this.campaignsService.findAll(query)
  }

  // @Get('mine')
  // async findUserCampaign() {
  // TODO: query campaign for current user
  // }

  @UseGuards(CampaignOwnersOrAdminGuard)
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const campaign = await this.campaignsService.findOne({ id })

    if (!campaign) throw new NotFoundException()

    return campaign
  }

  @Get('slug/:slug')
  @Roles('admin')
  async findBySlug(@Param('slug') slug: string) {
    const campaign = await this.campaignsService.findOne({ slug })

    if (!campaign) throw new NotFoundException()

    return campaign
  }

  @Post()
  async create(
    @ReqUser() user: User,
    @Body() campaignData: CreateCampaignSchema,
  ) {
    return await this.campaignsService.create(campaignData, user)
  }

  @Put(':id')
  @UseGuards(CampaignOwnersOrAdminGuard)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateCampaignSchema,
  ) {
    // TODO get campaign from req user
    const updateResp = await this.campaignsService.updateJsonFields(id, body)

    if (updateResp === false) throw new NotFoundException()
    return updateResp
  }
}
