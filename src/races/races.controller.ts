import { Controller, Get, Param, Query, UsePipes } from '@nestjs/common'
import { RacesService } from './services/races.service'
import {
  RacesByCityProximityQueryDto,
  RacesByCityQueryDto,
  RacesByCountyQueryDto,
  RacesByStateQueryDto,
  RacesListQueryDto,
} from './schemas/racesList.schema'
import { PublicAccess } from '../authentication/decorators/PublicAccess.decorator'
import { ZodValidationPipe } from 'nestjs-zod'

@Controller('races')
@UsePipes(ZodValidationPipe)
@PublicAccess()
export class RacesController {
  constructor(private readonly racesService: RacesService) {}

  @Get()
  async findRaces(
    @Query() { state, county, city, positionSlug }: RacesListQueryDto,
  ) {
    return await this.racesService.findRaces(state, county, city, positionSlug)
  }

  @Get(':hashId')
  async getByHashId(@Param('hashId') hashId: string) {
    return await this.racesService.getByHashId(hashId)
  }

  @Get('by-state')
  async findRacesByState(@Query() { state }: RacesByStateQueryDto) {
    return this.racesService.byState(state)
  }

  @Get('by-county')
  async findRacesByCounty(@Query() { state, county }: RacesByCountyQueryDto) {
    return this.racesService.byCounty(state, county)
  }

  @Get('by-city')
  async findRacesByCity(@Query() { state, county, city }: RacesByCityQueryDto) {
    return this.racesService.byCity(state, county, city)
  }

  @Get('proximity-cities')
  async findProximityCities(
    @Query() { state, city }: RacesByCityProximityQueryDto,
  ) {
    return this.racesService.byCityProximity(state, city)
  }
}
