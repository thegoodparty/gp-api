import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common'
import { parseRaces } from '../util/parseRaces.util'
import { sortRacesGroupedByYear } from '../util/sortRaces.util'
import { BallotReadyService } from './ballotReadyservice'

@Injectable()
export class BallotDataService {
  private readonly logger = new Logger(BallotDataService.name)
  constructor(private readonly ballotReadyService: BallotReadyService) {}

  async getRacesByZipcode(zipcode: string): Promise<any> {
    if (zipcode.length !== 5) {
      throw new InternalServerErrorException(
        'Zipcodes must be a string 5 digits in length. Received: ',
        zipcode,
      )
    }

    try {
      // await sails.helpers.queue.consumer();

      let startCursor

      let { races } = (await this.ballotReadyService.fetchRacesByZipcode(
        zipcode,
        startCursor,
      )) as any
      console.dir(races, { depth: 2 })
      let existingPositions = {}
      let electionsByYear = {}
      let primaryElectionDates = {} // key - positionId, value - electionDay and raceId (primary election date)
      let hasNextPage = false

      if (races?.edges) {
        hasNextPage = races.pageInfo.hasNextPage
        startCursor = races.pageInfo.endCursor
        const raceResponse = parseRaces(
          races,
          existingPositions,
          electionsByYear,
          primaryElectionDates,
        )
        existingPositions = raceResponse.existingPositions
        electionsByYear = raceResponse.electionsByYear
        primaryElectionDates = raceResponse.primaryElectionDates
      }

      while (hasNextPage === true) {
        const queryResponse =
          (await this.ballotReadyService.fetchRacesByZipcode(
            zipcode,
            startCursor,
          )) as any
        races = queryResponse?.races
        if (races) {
          const raceResponse = parseRaces(
            races,
            existingPositions,
            electionsByYear,
            primaryElectionDates,
          )
          existingPositions = raceResponse.existingPositions
          electionsByYear = raceResponse.electionsByYear
          primaryElectionDates = raceResponse.primaryElectionDates
          hasNextPage = races?.pageInfo?.hasNextPage || false
          startCursor = races?.pageInfo?.endCursor
        }
      }

      return sortRacesGroupedByYear(electionsByYear)
    } catch (e) {
      this.logger.error('error at ballotData/get', e)
      throw new InternalServerErrorException('Error getting races by zipcode')
    }
  }
}
