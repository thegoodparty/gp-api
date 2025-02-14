import { Controller, Get, Query } from '@nestjs/common'
import { PublicAccess } from 'src/authentication/decorators/PublicAccess.decorator'
import { ElectionsService } from './services/elections.service'

@Controller('elections')
@PublicAccess()
export class ElectionsController {
  constructor(private readonly electionsService: ElectionsService) {}

  @Get('races-by-year')
  async getRacesByZipcode(@Query('zipcode') zipcode: string) {
    return await this.electionsService.getRacesByZipcode(zipcode)
  }
}
