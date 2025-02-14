import { Controller, Get, Query, UsePipes } from '@nestjs/common'
import { PublicAccess } from 'src/authentication/decorators/PublicAccess.decorator'
import { RacesService } from './services/races.service'
import { ZodValidationPipe } from 'nestjs-zod'
import { RacesByYearSchema } from './schemas/RacesByYear.schema'

@Controller('elections')
@PublicAccess()
@UsePipes(ZodValidationPipe)
export class ElectionsController {
  constructor(private readonly racesService: RacesService) {}

  @Get('races-by-year')
  async getRacesByZipcode(
    @Query() { zipcode, level, electionDate }: RacesByYearSchema,
  ) {
    return await this.racesService.racesByYear({ zipcode, level, electionDate })
  }
}
