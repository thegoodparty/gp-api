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
  UsePipes,
} from '@nestjs/common'
import { CampaignsService } from './campaigns.service'
import { UpdateCampaignSchema } from './schemas/updateCampaign.schema'
import { CreateCampaignSchema } from './schemas/createCampaign.schema'
import { CampaignListSchema } from './schemas/campaignList.schema'
import { ZodValidationPipe } from 'nestjs-zod'
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'

@Controller('campaigns')
@UsePipes(ZodValidationPipe)
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Get()
  findAll(@Query() query: CampaignListSchema) {
    return this.campaignsService.findAll(query)
  }

  // @Get('mine')
  // async findUserCampaign() {
  // TODO: query campaign for current user
  // }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const campaign = await this.campaignsService.findOne({ id })

    if (!campaign) throw new NotFoundException()

    return campaign
  }

  @Get('slug/:slug')
  async findBySlug(@Param('slug') slug: string) {
    const campaign = await this.campaignsService.findOne({ slug })

    if (!campaign) throw new NotFoundException()

    return campaign
  }

  @Post()
  async create(@Body() body: CreateCampaignSchema) {
      const campaign = await this.campaignsService.create(body)
      return { slug: campaign.slug }
  }

  @Put(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateCampaignSchema,
  ) {
    // TODO get campaign from req user
    const updateResp = await this.campaignsService.update(id, body)

    if (updateResp === false) throw new NotFoundException()
    return updateResp
  }
}
