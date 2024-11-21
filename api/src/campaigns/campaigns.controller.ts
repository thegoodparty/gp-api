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
import {
  CampaignListQuery,
  CreateCampaignDto,
  UpdateCampaignDto,
} from './campaigns.dto'

@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Get()
  findAll(@Query() query: CampaignListQuery) {
    return this.campaignsService.findAll(query)
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const campaign = await this.campaignsService.findOne(id)

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
