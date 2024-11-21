import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common'
import { CampaignsService } from './campaigns.service'
import { UpdateCampaignDto } from './dto/updateCampaignDto'
import { CreateCampaignDto } from './dto/createCampaignDto'
import { CampaignListQuery } from './dto/campaignListQuery'

@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Get()
  findAll(@Query() query: CampaignListQuery) {
    return this.campaignsService.findAll(query)
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const campaign = await this.campaignsService.findById(id)

    if (!campaign) throw new NotFoundException()

    return campaign
  }

  @Get('slug/:slug')
  async findBySlug(@Param('slug') slug: string) {
    const campaign = await this.campaignsService.findBySlug(slug)

    if (!campaign) throw new NotFoundException()

    return campaign
  }

  @Post()
  async create(@Body() createCampaignDto: CreateCampaignDto) {
    const campaign = await this.campaignsService.create(createCampaignDto)
    return campaign
  }

  @Put(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateCampaignDto: UpdateCampaignDto,
  ) {
    return await this.campaignsService.update(id, updateCampaignDto)
  }

  // @Delete(':id')
  // deleteCampaign(@Param('id', ParseIntPipe) id: number) {
  //   return 'Deleted ' + id
  // }
}
