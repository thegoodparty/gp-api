import { Controller, Get, Query } from '@nestjs/common'
import { PublicAccess } from 'src/authentication/decorators/PublicAccess.decorator'
import { RacesService } from './services/races.service'

@Controller('elections')
@PublicAccess()
export class ElectionsController {
  constructor(private readonly racesService: RacesService) {}

  @Get('races-by-year')
  async getRacesByZipcode(@Query('zipcode') zipcode: string) {
    return await this.racesService.getRacesByZipcode(zipcode)
  }
}
