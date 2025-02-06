import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common'
import { parseRaces } from '../util/parseRaces.util'
import { sortRacesGroupedByYear } from '../util/sortRaces.util'
import { BallotReadyService } from './ballotReadyservice'
import { RacesByYear } from '../types/races.types'

@Injectable()
export class BallotDataService {
  private readonly logger = new Logger(BallotDataService.name)
  constructor(private readonly ballotReadyService: BallotReadyService) {}

  async getRacesByZipcode(zipcode: string): Promise<any> {
    // if (zipcode.length !== 5) {
    //   throw new InternalServerErrorException(
    //     'Zipcodes must be a string 5 digits in length. Received: ',
    //     zipcode,
    //   )
    // }

    try {
      // await sails.helpers.queue.consumer();

      let startCursor: string | undefined | null
      const existingPositions: Set<string> = new Set()
      const racesByYear: RacesByYear = {}
      const primaryElectionDates = {} // key - positionId, value - electionDay and raceId (primary election date)
      let hasNextPage = true

      let nextRacesPromise = this.ballotReadyService.fetchRacesByZipcode(
        zipcode,
        startCursor,
      )

      while (hasNextPage) {
        // Wait for the API response (while the previous parse was happening)
        const queryResponse = await nextRacesPromise
        if (!queryResponse) {
          throw new InternalServerErrorException(
            'Could not fetch data from BallotReady',
          )
        }
        const races = queryResponse.races
        if (races?.edges) {
          hasNextPage = races.pageInfo.hasNextPage
          startCursor = races.pageInfo.endCursor ?? null

          // Start the next API request while parsing
          nextRacesPromise = hasNextPage
            ? this.ballotReadyService.fetchRacesByZipcode(zipcode, startCursor)
            : Promise.resolve(null)

          //console.dir(races, { depth: 3 })

          // Process the current batch while the next request is running
          parseRaces(
            races,
            existingPositions,
            racesByYear,
            primaryElectionDates,
          )
          // existingPositions = raceResponse.existingPositions
          // electionsByYear = raceResponse.electionsByYear
          // primaryElectionDates = raceResponse.primaryElectionDates
        } else {
          hasNextPage = false
        }
      }

      return sortRacesGroupedByYear(racesByYear)
    } catch (e) {
      this.logger.error('error at ballotData/get', e)
      throw new InternalServerErrorException('Error getting races by zipcode')
    }
  }
}
