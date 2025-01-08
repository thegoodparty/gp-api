import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
} from '@nestjs/common'
import { MappingService } from './mapping.service'
import { CleanCampaign } from '../campaigns.types'

@Controller('campaigns/mapping')
export class MappingController {
  constructor(private readonly mappingService: MappingService) {}
  @Get('count')
  mapCount(): Promise<{ count: number }> {
    return this.mappingService.listMapCount()
  }

  @Get('map')
  map(): Promise<CleanCampaign[]> {
    return this.mappingService.listMap()
  }
}
