import { Controller, Get, Query, NotFoundException } from '@nestjs/common'
import { RacesService } from './races.service'
import { NormalizedRace } from './races.types'
import { ZodValidationPipe } from 'nestjs-zod'
import { RacesListQuery, racesListSchema } from './schemas/racesList.schema'

@Controller('races')
export class RacesController {
  constructor(private readonly racesService: RacesService) {}

  @Get()
  async findRaces(
    @Query(new ZodValidationPipe(racesListSchema)) query: RacesListQuery,
  ): Promise<NormalizedRace | NormalizedRace[]> {
    const { state, county, city, positionSlug } = query
    if (state && county && city && positionSlug) {
      const race = await this.racesService.findOne(
        state,
        county,
        city,
        positionSlug,
      )
      if (!race) {
        throw new NotFoundException('Race not found')
      }
      return race
    }
    if (state && county && city) {
      const races = await this.racesService.byCity(state, county, city)
      if (!races || races.length === 0) {
        throw new NotFoundException('Races not found')
      }
      return races
    }
    if (state && county) {
      const races = await this.racesService.byCounty(state, county)
      if (!races || races.length === 0) {
        throw new NotFoundException('Races not found')
      }
      return races
    }

    if (state && county) {
      const races = await this.racesService.byCounty(state, county)
      if (!races || races.length === 0) {
        throw new NotFoundException('Races not found')
      }
      return races
    }

    if (state) {
      const races = await this.racesService.byState(state)
      if (!races || races.length === 0) {
        throw new NotFoundException('Races not found')
      }
      return races
    }
    throw new NotFoundException('Race not found')
  }
}
