import { Controller, Get, Query } from '@nestjs/common'
import { PublicAccess } from 'src/authentication/decorators/PublicAccess.decorator'
import { BallotDataService } from './services/ballotData.service'

@Controller('ballotdata')
@PublicAccess()
export class BallotDataController {
  constructor(private readonly ballotDataService: BallotDataService) {}

  @Get()
  async getRacesByZipcode(@Query('zipcode') zipcode: string) {
    return await this.ballotDataService.getRacesByZipcode(zipcode)
  }
}
