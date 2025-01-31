import { Controller, Get, Query } from '@nestjs/common'
import { RacesService } from './services/races.service'
import { NormalizedRace } from './types/races.types'
import { RacesListQueryDto } from './schemas/racesList.schema'
import { PublicAccess } from '../authentication/decorators/PublicAccess.decorator'
import { BallotDataService } from './services/ballotData.service'

@Controller('races')
@PublicAccess()
export class RacesController {
  constructor(
    private readonly racesService: RacesService,
    private readonly ballotDataService: BallotDataService,
  ) {}

  @Get()
  async findRaces(
    @Query() { state, county, city, positionSlug }: RacesListQueryDto,
  ): Promise<NormalizedRace | NormalizedRace[] | boolean> {
    return await this.racesService.findRaces(state, county, city, positionSlug)
  }
}
