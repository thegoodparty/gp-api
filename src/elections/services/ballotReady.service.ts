import { Injectable, InternalServerErrorException } from '@nestjs/common'
import { endOfMonth, format, parseISO, startOfMonth } from 'date-fns'
import { gql, GraphQLClient } from 'graphql-request'
import { Headers, MimeTypes } from 'http-constants-ts'
import { PositionLevel } from 'src/generated/graphql.types'
import { truncateZip } from 'src/shared/util/zipcodes.util'
import zipcodes from 'zipcodes'
import { ElectionLevels } from '../../shared/constants/governmentLevels'
import {
  RaceNode,
  RacesByIdNode,
  RacesByZipcode,
  RacesWithElectionDates,
  RaceWithOfficeHolders,
  RaceWithOfficeHoldersNode,
} from '../types/ballotReady.types'
import { PinoLogger } from 'nestjs-pino'

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
  private readonly graphQLClient = new GraphQLClient(API_BASE, {
    headers,
  })

  async fetchRaceNormalizedPosition(raceId: string) {
    // Query for a single ID
    const query = gql`
      query GetNormalizedPosition {
        node(id: "${raceId}") {
          ... on Position {
            normalizedPosition {
              name
            }
          }
        }
      }
    `
    try {
      const result = await this.graphQLClient.request<{
        node: {
          normalizedPosition: {
            name: string
          } | null
        } | null
      }>(query)
      return result?.node?.normalizedPosition?.name ?? null
    } catch (error) {
      this.logger.error(
        { error },
        `Error at getNormalizedPosition for id ${raceId}:`,
      )
      return null
    }
  }

  async fetchRaceById(raceId: string): Promise<RacesByIdNode | null> {
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
      this.logger.error({ error }, 'Error at fetchRaceById:')
      return null
    }
  }

  async fetchRaceByPositionAndDate(params: {
    brPositionId: string
    electionDate: string
  }): Promise<RaceNode | null> {
    const { brPositionId, electionDate } = params
    const year = electionDate.slice(0, 4)
    const rangeStart = `${year}-01-01`
    const rangeEnd = `${year}-12-31`
    const query = gql`
      query RaceByPositionAndDate(
        $positionId: ID!
        $rangeStart: ISO8601Date!
        $rangeEnd: ISO8601Date!
      ) {
        node(id: $positionId) {
          ... on Position {
            races(
              filterBy: { electionDay: { gte: $rangeStart, lte: $rangeEnd } }
              first: 50
            ) {
              edges {
                node {
                  id
                  isPrimary
                  filingPeriods {
                    startOn
                    endOn
                  }
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
                    geoId
                    mtfcc
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
                    normalizedPosition {
                      name
                    }
                    tier
                  }
                }
              }
            }
          }
        }
      }
    `
    try {
      const result = await this.graphQLClient.request<
        {
          node: {
            races?: { edges: { node: RaceNode }[] }
          } | null
        },
        { positionId: string; rangeStart: string; rangeEnd: string }
      >(query, {
        positionId: brPositionId,
        rangeStart,
        rangeEnd,
      })
      const edges = result?.node?.races?.edges ?? []
      const target = edges.find(
        (e) => e.node.election.electionDay === electionDate,
      )?.node
      if (!target) {
        return null
      }
      const primary = edges
        .filter(
          (e) =>
            e.node.isPrimary && e.node.election.electionDay !== electionDate,
        )
        .map((e) => e.node)
        .sort((a, b) =>
          String(a.election.electionDay).localeCompare(
            String(b.election.electionDay),
          ),
        )[0]
      if (primary) {
        target.election.primaryElectionDate = String(
          primary.election.electionDay,
        )
        target.election.primaryElectionId = String(primary.election.id)
      }
      return target
    } catch (error) {
      this.logger.error({ error }, 'Error at fetchRaceByPositionAndDate:')
      throw error
    }
  }

  async fetchRacesByZipcode(
    zipcode: string,
    level?: string | null,
    electionDate?: string | null,
    startCursor?: string | null,
  ): Promise<RacesByZipcode | null> {
    let gt
    let lt
    if (electionDate) {
      ;({ gt, lt } = getMonthBounds(electionDate))
    } else {
      gt = new Date().toISOString().split('T')[0]
      const nextYear = new Date()
      nextYear.setFullYear(nextYear.getFullYear() + 2)
      lt = nextYear.toISOString().split('T')[0]
    }
    const state = zipcodes.lookup(zipcode)?.state

    let levelWithTownship = level?.toUpperCase()
    if (levelWithTownship === ElectionLevels.Local) {
      levelWithTownship = `${ElectionLevels.Local},TOWNSHIP,${ElectionLevels.City}`
    }
    if (levelWithTownship === ElectionLevels.County) {
      levelWithTownship = `${ElectionLevels.County},REGIONAL`
    }

    const query = gql`
    query {
      races(
        location: {
          zip: "${truncateZip(zipcode)}"
        }
        filterBy: {
          electionDay: {
            gte: "${gt}"
            lte: "${lt}"
          }
          ${state ? `state: "${state}"` : ''}
          ${levelWithTownship ? `level: [${levelWithTownship}]` : ''}
        }
        after: ${startCursor ? `"${startCursor}"` : null}
        first: 100
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
              geoId
              mtfcc
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
      this.logger.error({ error }, 'Error at fetchRacesByZipcode: ')
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
      this.logger.error({ error }, 'Error at fetchRacesWithElectionDates: ')
      return null
    }
  }

  async fetchRacesWithOfficeHolders(
    raceId: string,
  ): Promise<RaceWithOfficeHoldersNode | null> {
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
              seats
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
              officeHolders {
                nodes {
                  centralPhone
                  createdAt
                  databaseId
                  endAt
                  id
                  isAppointed
                  isCurrent
                  isOffCycle
                  isVacant
                  officePhone
                  officeTitle
                  otherPhone
                  primaryEmail
                  specificity
                  startAt
                  totalYearsInOffice
                  updatedAt
                  person {
                    createdAt
                    databaseId
                    email
                    firstName
                    fullName
                    id
                    lastName
                    middleName
                    nickname
                    phone
                    slug
                    suffix
                    updatedAt
                  }
                }
              }
            }
            filingPeriods {
              endOn
              startOn
            }
            candidacies {
              createdAt
              databaseId
              id
              isCertified
              isHidden
              result
              uncertified
              updatedAt
              withdrawn
              candidate {
                createdAt
                databaseId
                email
                firstName
                fullName
                id
                lastName
                middleName
                nickname
                phone
                slug
                suffix
                updatedAt
              }
              election {
                electionDay
              }
            }
          }
        }
      }
    `

    try {
      const response =
        await this.graphQLClient.request<RaceWithOfficeHolders>(query)
      return response?.node || null
    } catch (error) {
      this.logger.error({ error }, 'Error at fetchRacesWithOfficeHolders:')
      return null
    }
  }

  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(BallotReadyService.name)
  }
}

function getMonthBounds(dateString: string): { gt: string; lt: string } {
  const reference = parseISO(dateString)
  return {
    gt: format(startOfMonth(reference), 'yyyy-MM-dd'),
    lt: format(endOfMonth(reference), 'yyyy-MM-dd'),
  }
}
