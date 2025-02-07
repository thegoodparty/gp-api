import { Controller, Get, Query, UsePipes } from '@nestjs/common'
import { RacesService } from './services/races.service'
import { BallotDataService } from './services/ballotData.service'
import {
  NormalizedRace,
  ProximityCitiesResponseBody,
} from './types/races.types'
import {
  RacesByCityProximityQueryDto,
  RacesByCityQueryDto,
  RacesByCountyQueryDto,
  RacesListQueryDto,
} from './schemas/racesList.schema'
import { PublicAccess } from '../authentication/decorators/PublicAccess.decorator'
import { ZodValidationPipe } from 'nestjs-zod'

@Controller('races')
@UsePipes(ZodValidationPipe)
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

  @Get('by-county')
  async findRacesByCounty(
    @Query() { state, county }: RacesByCountyQueryDto,
  ): Promise<NormalizedRace | NormalizedRace[] | boolean> {
    return this.racesService.byCounty(state, county)
  }

  @Get('by-city')
  async findRacesByCity(
    @Query() { state, county, city }: RacesByCityQueryDto,
  ): Promise<NormalizedRace | NormalizedRace[] | boolean> {
    return this.racesService.byCity(state, county, city)
  }

  @Get('proximity-cities')
  async findProximityCities(
    @Query() { state, city }: RacesByCityProximityQueryDto,
  ): Promise<ProximityCitiesResponseBody> {
    return this.racesService.byCityProximity(state, city)
  }
}
