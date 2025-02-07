import { Controller, Get, Query } from '@nestjs/common'
import { PublicAccess } from 'src/authentication/decorators/PublicAccess.decorator'
import { BallotDataService } from './services/ballotData.service'

@Controller('ballotdata')
@PublicAccess()
export class BallotDataController {
  constructor(
    private readonly ballotDataService: BallotDataService,
    // private readonly ballotReadyService: BallotReadyService,
  ) {}

  @Get('races-by-year')
  async getRacesByZipcode(@Query('zipcode') zipcode: string) {
    return await this.ballotDataService.getRacesByZipcode(zipcode)
  }

  // @Get('test-other-endpoint')
  // async testOtherEndpoint(
  //   @Query() query: { zipcode: string; positionLevel: PositionLevel },
  // ) {
  //   return await this.ballotReadyService.fetchRacesWithElectionDates(
  //     query.zipcode,
  //     query.positionLevel,
  //   )
  // }
}
