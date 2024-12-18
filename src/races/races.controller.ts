import { Controller, Get, Query, NotFoundException } from '@nestjs/common'
import { RacesService } from './races.service'
import { NormalizedRace } from './races.types'
import { RacesListQueryDto } from './schemas/racesList.schema'
import { PublicAccess } from '../authentication/decorators/PublicAccess.decorator'

@Controller('races')
@PublicAccess()
export class RacesController {
  constructor(private readonly racesService: RacesService) {}

  @Get()
  async findRaces(
    @Query() { state, county, city, positionSlug }: RacesListQueryDto,
  ): Promise<NormalizedRace | NormalizedRace[] | boolean> {
    return await this.racesService.findRaces(state, county, city, positionSlug)
  }
}
