import { Controller, Get, Query } from '@nestjs/common'
import { MappingService } from './mapping.service'
import { CleanCampaign } from '../campaigns.types'
import { MapCountDto, MapDto } from '../schemas/mappingSchemas'

@Controller('campaigns/mapping')
export class MappingController {
  constructor(private readonly mappingService: MappingService) {}
  @Get('count')
  mapCount(@Query() query: MapCountDto): Promise<{ count: number }> {
    return this.mappingService.listMapCount(query.state, query.results)
  }

  @Get('map')
  map(@Query() query: MapDto): Promise<CleanCampaign[]> {
    return this.mappingService.listMap(
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
