import { Controller, Get, Query, NotFoundException } from '@nestjs/common'
import { RacesService } from './races.service'

@Controller('races')
export class RacesController {
  constructor(private readonly racesService: RacesService) {}

  @Get()
  async findRaces(
    @Query('state') state?: string,
    @Query('county') county?: string,
    @Query('city') city?: string,
    @Query('positionSlug') positionSlug?: string,
  ) {
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
      return await this.racesService.byCity(state, county, city)
    }
  }

  @Get('seed')
  seed() {
    return this.racesService.seed()
  }
}
