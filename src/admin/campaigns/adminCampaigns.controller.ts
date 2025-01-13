import {
  Body,
  Controller,
  Delete,
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

@Controller('admin/campaigns')
@Roles('admin')
@UsePipes(ZodValidationPipe)
export class AdminCampaignsController {
  constructor(
    private readonly adminCampaignsService: AdminCampaignsService,
    private readonly campaignsService: CampaignsService,
  ) {}

  @Post()
  create(@Body() body: AdminCreateCampaignSchema) {
    return this.adminCampaignsService.create(body)
  }

  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: AdminUpdateCampaignSchema,
  ) {
    return this.adminCampaignsService.update(id, body)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param('id', ParseIntPipe) id: number) {
    return this.campaignsService.delete({ where: { id } })
  }

  @Post(':id/send-victory-email')
  @HttpCode(HttpStatus.NO_CONTENT)
  sendVictoryEmail(@Param('id', ParseIntPipe) id: number) {
    return this.adminCampaignsService.sendVictoryEmail(id)
  }
}
