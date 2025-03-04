import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common'
import { EcanvasserService } from './ecanvasser.service'
import { CreateEcanvasserDto } from './dto/create-ecanvasser.dto'
import { UpdateEcanvasserDto } from './dto/update-ecanvasser.dto'
import { PublicAccess } from 'src/authentication/decorators/PublicAccess.decorator'
import { CampaignOwnerOrAdminGuard } from 'src/campaigns/guards/CampaignOwnerOrAdmin.guard'
import { Roles } from 'src/authentication/decorators/Roles.decorator'
@Controller('ecanvasser')
export class EcanvasserController {
  constructor(private readonly ecanvasserService: EcanvasserService) {}

  @Post()
  @Roles('admin')
  create(@Body() createEcanvasserDto: CreateEcanvasserDto) {
    return this.ecanvasserService.create(createEcanvasserDto)
  }

  @Get(':campaignId')
  @UseGuards(CampaignOwnerOrAdminGuard)
  findOne(@Param('campaignId', ParseIntPipe) campaignId: number) {
    return this.ecanvasserService.findByCampaignId(campaignId)
  }

  @Patch(':campaignId')
  @UseGuards(CampaignOwnerOrAdminGuard)
  update(
    @Param('campaignId', ParseIntPipe) campaignId: number,
    @Body() updateEcanvasserDto: UpdateEcanvasserDto,
  ) {
    return this.ecanvasserService.update(campaignId, updateEcanvasserDto)
  }

  @Delete(':campaignId')
  @Roles('admin')
  remove(@Param('campaignId', ParseIntPipe) campaignId: number) {
    return this.ecanvasserService.remove(campaignId)
  }

  @Post(':campaignId/sync')
  @Roles('admin')
  sync(@Param('campaignId', ParseIntPipe) campaignId: number) {
    return this.ecanvasserService.sync(campaignId)
  }

  @Get('list')
  @Roles('admin')
  findAll() {
    return this.ecanvasserService.findAll()
  }

  @Post('sync-all')
  @PublicAccess() // why is this not working?
  syncAll() {
    return this.ecanvasserService.syncAll()
  }
}
