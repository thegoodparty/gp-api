import {
  Controller,
  UsePipes,
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
import { PinoLogger } from 'nestjs-pino'

@Controller('campaigns/:id/positions')
@UseGuards(CampaignOwnerOrAdminGuard)
@UsePipes(ZodValidationPipe)
export class CampaignPositionsController {
  constructor(
    private readonly campaignPositionsService: CampaignPositionsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CampaignPositionsController.name)
  }

  @Get()
  findByCampaign(@Param('id', ParseIntPipe) id: number) {
    return this.campaignPositionsService.findByCampaignId(id)
  }

  @Post()
  create(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Omit<CreateCampaignPositionSchema, 'campaignId'>,
  ) {
    const fullBody: CreateCampaignPositionSchema = { ...body, campaignId: id }
    // If campaignId is accepted in the body instead, any user can create campaignPositions for any campaign
    // Thus, we add it into the body from the URL since that ID has already been checked by the CampaignOwnerOrAdminGuard
    return this.campaignPositionsService.create(fullBody)
  }

  @Put(':positionId')
  update(
    @Param('positionId', ParseIntPipe) positionId: number,
    @Body() body: UpdateCampaignPositionSchema,
  ) {
    return this.campaignPositionsService.update(positionId, body)
  }

  @Delete(':positionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param('positionId', ParseIntPipe) positionId: number) {
    return this.campaignPositionsService.delete(positionId)
  }
}
