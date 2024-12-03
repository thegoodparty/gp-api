import {
  BadRequestException,
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
import { AdminCreateCamapaignSchema } from './schemas/adminCreateCampaign.schema'
import { ZodValidationPipe } from 'nestjs-zod'
import { AdminUpdateCampaignSchema } from './schemas/adminUpdateCampaign.schema'
import { AdminSendCreateEmailSchema } from './schemas/adminSendCreateEmail.schema'

@Controller('admin/campaigns')
@UsePipes(ZodValidationPipe)
export class AdminCampaignsController {
  constructor(private readonly adminCampaignsService: AdminCampaignsService) {}

  @Post()
  async create(@Body() body: AdminCreateCamapaignSchema) {
    const result = await this.adminCampaignsService.create(body)

    if (typeof result === 'string') {
      throw new BadRequestException(result)
    }

    return result
  }

  @Put(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: AdminUpdateCampaignSchema,
  ) {
    const result = await this.adminCampaignsService.update(id, body)

    if (typeof result === 'string') {
      throw new BadRequestException(result)
    }

    return result
  }

  @Delete(':id')
  @HttpCode(204)
  async delete(@Param('id', ParseIntPipe) id: number) {
    const result = await this.adminCampaignsService.delete(id)

    if (typeof result === 'string') {
      throw new BadRequestException(result)
    }

    return true
  }

  @Post('email')
  @HttpCode(204)
  async sendEmail(@Body() { userId }: AdminSendCreateEmailSchema) {
    const result = await this.adminCampaignsService.sendCreateEmail(userId)

    if (typeof result === 'string') {
      throw new BadRequestException(result)
    }

    return result
  }
}
