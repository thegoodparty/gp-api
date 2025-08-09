import {
  Controller,
  Get,
  Query,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { PublicAccess } from '../../authentication/decorators/PublicAccess.decorator'
import { FindByRaceIdDto } from '../schemas/public/FindByRaceId.schema'
import { FindByRaceIdResponse } from '../schemas/public/FindByRaceIdResponse.schema'
import { PublicCampaignsService } from '../services/public-campaigns.service'

@Controller('public-campaigns')
@PublicAccess()
export class PublicCampaignsController {
  private readonly logger = new Logger(PublicCampaignsController.name)

  constructor(
    private readonly publicCampaignsService: PublicCampaignsService,
  ) {}

  @Get()
  async findByRaceId(
    @Query() dto: FindByRaceIdDto,
  ): Promise<FindByRaceIdResponse> {
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
