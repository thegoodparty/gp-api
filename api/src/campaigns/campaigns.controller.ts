import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common'
import { CampaignsService } from './campaigns.service'
import { CreateCampaignDto, GetCampaignParams } from './campaigns.dto'

@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Get()
  getCampaigns() {
    return this.campaignsService.findAll()
  }

  @Get(':id')
  async getCampaign(@Param() { id }: GetCampaignParams) {
    const campaign = await this.campaignsService.findOne(id)

    if (!campaign) throw new NotFoundException()

    return campaign
  }

  @Post()
  async createCampaign(@Body() createCampaignDto: CreateCampaignDto) {
    const campaign = await this.campaignsService.create(createCampaignDto)
    return campaign
  }

  // @Put(':id')
  // updateCampaign(
  //   @Param('id', ParseIntPipe) id: number,
  //   @Body() campaign: Partial<Campaign>,
  // ) {
  //   return `Updated: ${id} - ${campaign}`
  // }

  // @Delete(':id')
  // deleteCampaign(@Param('id', ParseIntPipe) id: number) {
  //   return 'Deleted ' + id
  // }
}
