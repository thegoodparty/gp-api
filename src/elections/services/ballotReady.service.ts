import { Injectable, InternalServerErrorException } from '@nestjs/common'
import {
  compareAsc,
  endOfMonth,
  format,
  parseISO,
  startOfMonth,
} from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
import { gql, GraphQLClient } from 'graphql-request'
import { Headers, MimeTypes } from 'http-constants-ts'
import { PositionLevel } from 'src/generated/graphql.types'
import { truncateZip } from 'src/shared/util/zipcodes.util'
import zipcodes from 'zipcodes'
import { ElectionLevels } from '../../shared/constants/governmentLevels'
import {
  BallotReadyMilestone,
  RaceMilestonesGraphResponse,
  RaceNode,
  RacesByIdNode,
  RacesByZipcode,
  RacesWithElectionDates,
  RaceWithOfficeHolders,
  RaceWithOfficeHoldersNode,
} from '../types/ballotReady.types'
import type { MilestoneWindow, RaceMilestones } from '@goodparty_org/contracts'
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

  // Fetch the per-category milestone windows for a BR race. Source:
  // Race.election.milestones() — BR returns one row per (category, type,
  // feature), so we collapse via earliest OPEN / latest CLOSE per
  // category. Returns null on any failure so callers can null-fill the
  // field without failing the parent request — milestones are enrichment,
  // not core.
  async fetchMilestones(brHashId: string): Promise<RaceMilestones | null> {
    if (!brHashId) return null
    const query = gql`
      query MilestonesForRace($raceId: ID!) {
        node(id: $raceId) {
          ... on Race {
            election {
              milestones {
                category
                type
                at
              }
            }
          }
        }
      }
    `
    try {
      const result = await this.graphQLClient.request<
        RaceMilestonesGraphResponse,
        { raceId: string }
      >(query, { raceId: brHashId })
      const milestones = result?.node?.election?.milestones ?? []
      return collapseMilestones(milestones)
    } catch (error) {
      this.logger.warn(
        { error, brHashId },
        'BR Race.election.milestones lookup failed',
      )
      return null
    }
  }

  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(BallotReadyService.name)
  }
}

// Group BR milestones by category, picking the earliest OPEN and latest
// CLOSE per category. BR returns one row per (category, type, feature)
// combo — e.g. REGISTRATION CLOSE has separate rows for IN_PERSON, MAIL,
// ONLINE deadlines. Earliest OPEN captures the first opportunity to
// register/vote; latest CLOSE captures the final deadline a voter can
// still hit (matters because some states close ONLINE earlier than
// IN_PERSON). UI consumers can render the window without reasoning about
// features. Exported for direct unit testing.
export const collapseMilestones = (
  milestones: BallotReadyMilestone[],
): RaceMilestones => {
  const grouped: Record<string, { opens: string[]; closes: string[] }> = {
    REGISTRATION: { opens: [], closes: [] },
    EARLY_VOTING: { opens: [], closes: [] },
    REQUEST_BALLOT: { opens: [], closes: [] },
  }

  for (const m of milestones) {
    if (!m.at) continue
    const bucket = grouped[m.category]
    if (!bucket) continue
    if (m.type === 'OPEN') bucket.opens.push(m.at)
    else if (m.type === 'CLOSE') bucket.closes.push(m.at)
  }

  return {
    voter_registration: toWindow(grouped.REGISTRATION),
    early_voting: toWindow(grouped.EARLY_VOTING),
    request_ballot: toWindow(grouped.REQUEST_BALLOT),
  }
}

const toWindow = (bucket: {
  opens: string[]
  closes: string[]
}): MilestoneWindow | null => {
  const start = earliestDate(bucket.opens)
  const end = latestDate(bucket.closes)
  if (start === null && end === null) return null
  return { start, end }
}

// Use `compareAsc` over raw `<`/`>` and `format(parseISO(...), 'yyyy-MM-dd')`
// over `slice(0, 10)`: BR's `at` is a datetime string that may carry a
// non-UTC offset (e.g. '2026-10-19T00:00:00-05:00'). Lexicographic
// comparison would reorder dates across offsets, and a naive slice would
// take the literal date digits — which can be the wrong calendar date
// when the offset crosses midnight. CLAUDE.md Rule 28.
const earliestDate = (values: string[]): string | null => {
  if (values.length === 0) return null
  return toIsoDate(
    values.reduce((a, b) =>
      compareAsc(parseISO(a), parseISO(b)) <= 0 ? a : b,
    ),
  )
}

const latestDate = (values: string[]): string | null => {
  if (values.length === 0) return null
  return toIsoDate(
    values.reduce((a, b) =>
      compareAsc(parseISO(a), parseISO(b)) >= 0 ? a : b,
    ),
  )
}

// Format in UTC explicitly. `format(parseISO(...), 'yyyy-MM-dd')` would
// use the server's local timezone, shifting the calendar date when the
// source is UTC midnight (test machines in negative-offset zones see a
// previous-day date). UTC keeps it deterministic across environments.
const toIsoDate = (value: string): string =>
  formatInTimeZone(parseISO(value), 'UTC', 'yyyy-MM-dd')

function getMonthBounds(dateString: string): { gt: string; lt: string } {
  const reference = parseISO(dateString)
  return {
    gt: format(startOfMonth(reference), 'yyyy-MM-dd'),
    lt: format(endOfMonth(reference), 'yyyy-MM-dd'),
  }
}
