import { Controller, Get, Query } from '@nestjs/common'
import { CampaignMapService } from './campaignMap.service'
import { CleanCampaign } from './campaignMap.types'
import { MapCountDto, MapDto } from '../schemas/mappingSchemas'

@Controller('campaigns/mapping')
export class CampaignMapController {
  constructor(private readonly CampaignMapService: CampaignMapService) {}
  @Get('count')
  mapCount(@Query() query: MapCountDto): Promise<{ count: number }> {
    return this.CampaignMapService.listMapCampaignsCount(
      query.state,
      query.results,
    )
  }

  @Get('map')
  map(@Query() query: MapDto): Promise<CleanCampaign[]> {
    return this.CampaignMapService.listMapCampaigns(
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
