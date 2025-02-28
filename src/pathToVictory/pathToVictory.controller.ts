import {
  Controller,
  Get,
  Param,
  Logger,
  BadGatewayException,
  HttpException,
  ParseIntPipe,
} from '@nestjs/common'
import { EnqueuePathToVictoryService } from './services/enqueuePathToVictory.service'
import { Roles } from '../authentication/decorators/Roles.decorator'
import { UserRole } from '@prisma/client'

@Controller('path-to-victory')
@Roles(UserRole.admin)
export class PathToVictoryController {
  private readonly logger = new Logger(PathToVictoryController.name)

  constructor(
    private readonly enqueuePathToVictoryService: EnqueuePathToVictoryService,
  ) {}

  @Get(':campaignId')
  async enqueuePathToVictory(
    @Param('campaignId', ParseIntPipe) campaignId: number,
  ) {
    try {
      await this.enqueuePathToVictoryService.enqueuePathToVictory(campaignId)
      return {
        success: true,
        message: `Path to victory calculation for campaign ${campaignId} has been enqueued successfully`,
      }
    } catch (e) {
      if (e instanceof Error) {
        this.logger.error(
          `Error at PathToVictoryController enqueuePathToVictory. e.message: ${e.message}`,
          e.stack,
        )

        if (e instanceof HttpException) {
          throw e
        }

        throw new BadGatewayException(
          e.message ||
            `Error occurred while enqueuing path to victory for campaign ${campaignId}`,
        )
      }
    }
  }
}
