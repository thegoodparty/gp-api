import { Controller, Get, Query } from '@nestjs/common'
import { RacesService } from './services/races.service'
import { NormalizedRace, ProximityCitiesResponseBody } from './races.types'
import {
  RacesByCityProximityQueryDto,
  RacesByCityQueryDto,
  RacesByCountyQueryDto,
  RacesListQueryDto,
} from './schemas/racesList.schema'
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

  @Get('by-county')
  @PublicAccess()
  async findRacesByCounty(
    @Query() { state, county }: RacesByCountyQueryDto,
  ): Promise<NormalizedRace | NormalizedRace[] | boolean> {
    return this.racesService.byCounty(state, county)
  }

  @Get('by-city')
  @PublicAccess()
  async findRacesByCity(
    @Query() { state, county, city }: RacesByCityQueryDto,
  ): Promise<NormalizedRace | NormalizedRace[] | boolean> {
    return this.racesService.byCity(state, county, city)
  }

  @Get('proximity-cities')
  @PublicAccess()
  async findProximityCities(
    @Query() { state, city }: RacesByCityProximityQueryDto,
  ): Promise<ProximityCitiesResponseBody> {
    return this.racesService.byCityProximity(state, city)
  }
}
