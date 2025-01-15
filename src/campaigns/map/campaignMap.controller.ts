import { Controller, Get, Query } from '@nestjs/common'
import { CampaignMapService } from './campaignMap.service'
import { MapCampaign } from './campaignMap.types'
import { MapCountDto, MapDto } from '../schemas/mappingSchemas'

@Controller('campaigns/map')
export class CampaignMapController {
  constructor(private readonly campaignMapService: CampaignMapService) {}
  @Get('count')
  async mapCount(@Query() query: MapCountDto): Promise<{ count: number }> {
    const count = await this.campaignMapService.listMapCampaignsCount(
      query.state,
      query.results,
    )
    return { count }
  }

  @Get()
  map(@Query() query: MapDto): Promise<MapCampaign[]> {
    return this.campaignMapService.listMapCampaigns(
      query.party,
      query.state,
      query.level,
      query.results,
      query.office,
      query.name,
      query.forceReCalc,
    )
  }
}
