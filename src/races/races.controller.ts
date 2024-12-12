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
  ): Promise<NormalizedRace | NormalizedRace[] | boolean> {
    const { state, county, city, positionSlug } = query

    // Delegate the logic to the service
    const races = await this.racesService.findRaces(
      state,
      county,
      city,
      positionSlug,
    )

    if (!races || (Array.isArray(races) && races.length === 0)) {
      throw new NotFoundException('Race(s) not found')
    }

    return races
  }
}
