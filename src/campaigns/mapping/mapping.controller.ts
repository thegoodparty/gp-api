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

@Controller('campaigns/mapping')
export class MappingController {
  constructor(private readonly mappingService: MappingService) {}
  @Get()
  mapCount(): Promise<{ count: number }> {
    this.mappingService.listMapCount()
  }
}
