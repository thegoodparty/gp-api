import { Controller, Get, Query, NotFoundException } from '@nestjs/common'
import { PublicAccess } from 'src/authentication/decorators/PublicAccess.decorator'
import { FindByRaceIdDto } from '../schemas/public/FindByRaceId.schema'
import { FindByRaceIdResponseDto } from '../schemas/public/FindByRaceIdResponse.schema'
import { PublicCampaignsService } from '../services/public-campaigns.service'
import { PinoLogger } from 'nestjs-pino'

@Controller('public-campaigns')
@PublicAccess()
export class PublicCampaignsController {
  constructor(
    private readonly publicCampaignsService: PublicCampaignsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(PublicCampaignsController.name)
  }

  @Get()
  async findByRaceId(
    @Query() dto: FindByRaceIdDto,
  ): Promise<FindByRaceIdResponseDto> {
    this.logger.debug(
      `Finding campaign by race ID: ${dto.raceId}, name: ${dto.firstName} ${dto.lastName}`,
    )

    const result = await this.publicCampaignsService.findCampaignByRaceId(dto)

    if (!result) {
      throw new NotFoundException('No matching campaign found')
    }

    return result
  }
}
