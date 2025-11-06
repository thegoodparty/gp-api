import {
  Controller,
  Get,
  Query,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { PublicAccess } from 'src/authentication/decorators/PublicAccess.decorator'
import { FindByRaceIdDto } from '../schemas/public/FindByRaceId.schema'
import { FindByRaceIdResponseDto } from '../schemas/public/FindByRaceIdResponse.schema'
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
  ): Promise<FindByRaceIdResponseDto> {
    this.logger.debug('Finding campaign by race ID and name', {
      raceId: dto.raceId,
      firstName: dto.firstName,
      lastName: dto.lastName,
    })

    const result = await this.publicCampaignsService.findCampaignByRaceId(dto)

    if (!result) {
      throw new NotFoundException('No matching campaign found')
    }

    return result
  }
}
