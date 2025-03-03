import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common'
import { EcanvasserService } from './ecanvasser.service'
import { CreateEcanvasserDto } from './dto/create-ecanvasser.dto'
import { UpdateEcanvasserDto } from './dto/update-ecanvasser.dto'

@Controller('ecanvasser')
export class EcanvasserController {
  constructor(private readonly ecanvasserService: EcanvasserService) {}

  @Post(':campaignId')
  create(
    @Param('campaignId', ParseIntPipe) campaignId: number,
    @Body() createEcanvasserDto: CreateEcanvasserDto,
  ) {
    return this.ecanvasserService.create(campaignId, createEcanvasserDto)
  }

  @Get(':campaignId')
  findOne(@Param('campaignId', ParseIntPipe) campaignId: number) {
    return this.ecanvasserService.findByCampaignId(campaignId)
  }

  @Patch(':campaignId')
  update(
    @Param('campaignId', ParseIntPipe) campaignId: number,
    @Body() updateEcanvasserDto: UpdateEcanvasserDto,
  ) {
    return this.ecanvasserService.update(campaignId, updateEcanvasserDto)
  }

  @Delete(':campaignId')
  remove(@Param('campaignId', ParseIntPipe) campaignId: number) {
    return this.ecanvasserService.remove(campaignId)
  }

  @Post(':campaignId/sync')
  sync(@Param('campaignId', ParseIntPipe) campaignId: number) {
    return this.ecanvasserService.sync(campaignId)
  }
}
