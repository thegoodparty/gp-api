import { Controller, Get, Query, UsePipes } from '@nestjs/common'
import { PublicAccess } from 'src/authentication/decorators/PublicAccess.decorator'
import { RacesService } from './services/races.service'
import { ZodValidationPipe } from 'nestjs-zod'
import { RacesByZipSchema } from './schemas/RacesByZip.schema'

@Controller('elections')
@PublicAccess()
@UsePipes(ZodValidationPipe)
export class ElectionsController {
  constructor(private readonly racesService: RacesService) {}

  @Get('races-by-year')
  async getRacesByZipcode(
    @Query() { zipcode, level, electionDate }: RacesByZipSchema,
  ) {
    return await this.racesService.getRaces({ zipcode, level, electionDate })
  }
}
