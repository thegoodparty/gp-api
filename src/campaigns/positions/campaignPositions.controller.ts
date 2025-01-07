import {
  Controller,
  UsePipes,
  Logger,
  Get,
  Post,
  Put,
  Param,
  ParseIntPipe,
  Delete,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common'
import { ZodValidationPipe } from 'nestjs-zod'
import { CampaignPositionsService } from './campaignPositions.service'
import { CreateCampaignPositionSchema } from './schemas/CreateCampaignPosition.schema'
import { CampaignOwnerOrAdminGuard } from '../guards/CampaignOwnerOrAdmin.guard'
import { UpdateCampaignPositionSchema } from './schemas/UpdateCampaignPosition.schema'

@Controller('campaigns/:id/positions')
@UseGuards(CampaignOwnerOrAdminGuard)
@UsePipes(ZodValidationPipe)
export class CampaignPositionsController {
  private readonly logger = new Logger(CampaignPositionsController.name)

  constructor(
    private readonly campaignPositionsService: CampaignPositionsService,
  ) {}

  @Get()
  findByCampaign(@Param('id', ParseIntPipe) id: number) {
    return this.campaignPositionsService.findByCampaign(id)
  }

  @Post()
  create(@Body() body: CreateCampaignPositionSchema) {
    return this.campaignPositionsService.create(body)
  }

  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateCampaignPositionSchema,
  ) {
    return this.campaignPositionsService.update(id, body)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param('id', ParseIntPipe) id: number) {
    return this.campaignPositionsService.delete(id)
  }
}
