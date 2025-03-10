import {
  Controller,
  Get,
  Param,
  Logger,
  BadGatewayException,
  HttpException,
  ParseIntPipe,
} from '@nestjs/common'
import { ViabilityService } from './services/viability.service'
import { Roles } from '../authentication/decorators/Roles.decorator'
import { UserRole } from '@prisma/client'

// admin only controller for testing viability score
@Controller('viability')
@Roles(UserRole.admin)
export class ViabilityController {
  private readonly logger = new Logger(ViabilityController.name)

  constructor(private readonly viabilityService: ViabilityService) {}

  @Get(':campaignId')
  async calculateViability(
    @Param('campaignId', ParseIntPipe) campaignId: number,
  ) {
    try {
      const viabilityScore =
        await this.viabilityService.calculateViabilityScore(campaignId)
      return {
        success: true,
        message: `Viability score calculated successfully for campaign ${campaignId}`,
        data: viabilityScore,
      }
    } catch (e) {
      if (e instanceof Error) {
        this.logger.error(
          `Error at ViabilityController calculateViability. e.message: ${e.message}`,
          e.stack,
        )

        if (e instanceof HttpException) {
          throw e
        }

        throw new BadGatewayException(
          e.message ||
            `Error occurred while calculating viability score for campaign ${campaignId}`,
        )
      }
    }
  }
}
