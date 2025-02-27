import { Controller, Get, Query } from '@nestjs/common'
import { CampaignMapService } from './campaignMap.service'
import { MapCampaign } from './campaignMap.types'
import { MapSchema } from '../schemas/mappingSchemas'
import { PublicAccess } from 'src/authentication/decorators/PublicAccess.decorator'

@Controller('campaigns/map')
@PublicAccess()
export class CampaignMapController {
  constructor(private readonly campaignMapService: CampaignMapService) {}
  @Get('count')
  async mapCount(@Query() query: MapSchema): Promise<{ count: number }> {
    const count = await this.campaignMapService.listMapCampaignsCount(
      query.state,
      query.results,
    )
    return { count }
  }

  @Get()
  map(@Query() query: MapSchema): Promise<MapCampaign[]> {
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
