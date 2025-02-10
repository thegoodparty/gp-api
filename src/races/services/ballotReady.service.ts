import { Injectable, InternalServerErrorException } from '@nestjs/common'
import { GraphQLClient, gql } from 'graphql-request'
import { Logger } from '@nestjs/common'
import { truncateZip } from 'src/shared/util/zipcodes.util'
import { PositionLevel } from 'src/generated/graphql.types'
import {
  RacesById,
  RacesByZipcode,
  RacesWithElectionDates,
} from '../types/ballotReady.types'
import { Headers, MimeTypes } from 'http-constants-ts'

const API_BASE = 'https://bpi.civicengine.com/graphql'
const BALLOT_READY_KEY = process.env.BALLOT_READY_KEY
if (!BALLOT_READY_KEY) {
  throw new InternalServerErrorException(
    'Please set BALLOT_READY_KEY in your .env',
  )
}

const headers = {
  [Headers.AUTHORIZATION]: `Bearer ${BALLOT_READY_KEY}`,
  [Headers.CONTENT_TYPE]: MimeTypes.APPLICATION_JSON,
}

@Injectable()
export class BallotReadyService {
  private readonly logger = new Logger(BallotReadyService.name)
  private readonly graphQLClient = new GraphQLClient(API_BASE, {
    headers,
  })

  async fetchRaceById(raceId: string): Promise<RacesById | null> {
    const query = gql`
          query Node {
            node(id: "${raceId}") {
                ... on Race {
                    databaseId
                    isPartisan
                    isPrimary
                    election {
                        electionDay
                        name
                        state
                    }
                    position {
                        id
                        description
                        judicial
                        level
                        name
                        partisanType
                        staggeredTerm
                        state
                        subAreaName
                        subAreaValue
                        tier
                        mtfcc
                        geoId
                        electionFrequencies {
                            frequency
                        }
                        hasPrimary
                        normalizedPosition {
                          name
                      }
                    }
                    filingPeriods {
                        endOn
                        startOn
                    }
                }
            }
        }
        `

    try {
      return await this.graphQLClient.request(query)
    } catch (error) {
      this.logger.error('Error at fetchRaceById:', error)
      return null
    }
  }

  async fetchRacesByZipcode(
    zipcode: string,
    startCursor?: string | null,
  ): Promise<RacesByZipcode | null> {
    const today = new Date().toISOString().split('T')[0]
    const nextYear = new Date()
    nextYear.setFullYear(nextYear.getFullYear() + 4)
    const nextYearFormatted = nextYear.toISOString().split('T')[0]

    const query = gql`
    query {
      races(
        location: {
          zip: "${truncateZip(zipcode)}"
        }
        filterBy: {
          electionDay: {
            gt: "${today}"
            lt: "${nextYearFormatted}"
          }
        }
        after: ${startCursor ? `"${startCursor}"` : null}
      ) {
        edges {
          node {
            id
            isPrimary
            election {
              id
              electionDay
              name
              originalElectionDate
              state
              timezone
            }
            position {
              id
              appointed
              hasPrimary
              partisanType
              level
              name
              salary
              state
              subAreaName
              subAreaValue
              electionFrequencies {
                frequency
              }
            }
            filingPeriods {
              startOn
              endOn
            }
          }
        }
        pageInfo {
          endCursor
          hasNextPage
          hasPreviousPage
          startCursor
        }
      }
    }
    `
    try {
      return await this.graphQLClient.request(query)
    } catch (error) {
      this.logger.error('Error at fetchRacesByZipcode: ', error)
      return null
    }
  }

  async fetchRacesWithElectionDates(
    zipcode: string,
    positionLevel: PositionLevel,
  ): Promise<RacesWithElectionDates | null> {
    const today = new Date().toISOString().split('T')[0]

    const query = gql`
            query {
                races(
                    location: { zip: "${zipcode}" }
                    filterBy: { electionDay: { gt: "2006-01-01", lt: "${today}" }, level: ${positionLevel} }
                ) {
                    edges {
                        node {
                            position {    
                                name
                            }
                            election {
                                electionDay
                            }
                        }
                    }
                }
            }`

    try {
      return await this.graphQLClient.request(query)
    } catch (error) {
      this.logger.error('Error at fetchRacesWithElectionDates: ', error)
      return null
    }
  }
}
