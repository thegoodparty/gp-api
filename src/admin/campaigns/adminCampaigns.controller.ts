import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Put,
  UsePipes,
} from '@nestjs/common'
import { AdminCampaignsService } from './adminCampaigns.service'
import { AdminCreateCampaignSchema } from './schemas/adminCreateCampaign.schema'
import { ZodValidationPipe } from 'nestjs-zod'
import { AdminUpdateCampaignSchema } from './schemas/adminUpdateCampaign.schema'
import { Roles } from '../../authentication/decorators/Roles.decorator'
import { CampaignsService } from 'src/campaigns/services/campaigns.service'
import { UserRole } from '@prisma/client'

@Controller('admin/campaigns')
@Roles(UserRole.admin)
@UsePipes(ZodValidationPipe)
export class AdminCampaignsController {
  constructor(
    private readonly adminCampaigns: AdminCampaignsService,
    private readonly campaigns: CampaignsService,
  ) {}

  @Post()
  @Roles(UserRole.admin, UserRole.sales)
  create(@Body() body: AdminCreateCampaignSchema) {
    return this.adminCampaigns.create(body)
  }

  @Put(':id')
  @Roles(UserRole.admin, UserRole.sales)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: AdminUpdateCampaignSchema,
  ) {
    return this.adminCampaigns.update(id, body)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param('id', ParseIntPipe) id: number) {
    return this.campaigns.delete({ where: { id } })
  }

  @Post(':id/send-victory-email')
  @HttpCode(HttpStatus.NO_CONTENT)
  sendVictoryEmail(@Param('id', ParseIntPipe) id: number) {
    return this.adminCampaigns.sendVictoryEmail(id)
  }

  @Get('pro-no-voter-file')
  proCampaignsWithNoVoterFile() {
    return this.adminCampaigns.proNoVoterFile()
  }

  @Get('p2v-stats')
  p2vStats() {
    return this.adminCampaigns.p2vStats()
  }
}
