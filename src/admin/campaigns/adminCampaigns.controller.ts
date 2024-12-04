import {
  Body,
  Controller,
  Delete,
  HttpCode,
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
import { AdminSendCreateEmailSchema } from './schemas/adminSendCreateEmail.schema'

@Controller('admin/campaigns')
@UsePipes(ZodValidationPipe)
export class AdminCampaignsController {
  constructor(private readonly adminCampaignsService: AdminCampaignsService) {}

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
  @HttpCode(204)
  delete(@Param('id', ParseIntPipe) id: number) {
    return this.adminCampaignsService.delete(id)
  }

  @Post('email')
  @HttpCode(204)
  async sendEmail(@Body() { userId }: AdminSendCreateEmailSchema) {
    return this.adminCampaignsService.sendCreateEmail(userId)
  }
}
