import { Injectable, InternalServerErrorException } from '@nestjs/common'
import {
  ChatCompletionNamedToolChoice,
  ChatCompletionTool,
} from 'openai/resources/chat/completions'
import { PositionLevel } from 'src/generated/graphql.types'
import { AiService } from '../../ai/ai.service'
import { AiChatMessage } from '../../campaigns/ai/chat/aiChat.types'
import {
  CITY_PROMPT,
  COUNTY_PROMPT,
  TOWN_PROMPT,
  TOWNSHIP_PROMPT,
  VILLAGE_PROMPT,
} from '../constants/prompts.consts'
import { RacesByZipSchema } from '../schemas/RacesByZip.schema'
import { RaceNode, RacesByIdNode } from '../types/ballotReady.types'
import { GeoData } from '../types/elections.types'
import {
  censusRowToGeoData,
  extractCityFromGeoData,
} from '../util/geoData.util'
import { parseRaces } from '../util/parseRaces.util'
import { BallotReadyService } from './ballotReady.service'
import { CensusEntitiesService } from './censusEntities.service'
import { PinoLogger } from 'nestjs-pino'

@Injectable()
export class RacesService {
  constructor(
    private readonly censusEntities: CensusEntitiesService,
    private readonly ballotReadyService: BallotReadyService,
    private readonly ai: AiService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(RacesService.name)
  }

  async getRaceById(raceId: string) {
    const raceNode = await this.ballotReadyService.fetchRaceById(raceId)
    if (raceNode && raceNode?.node) {
      return raceNode.node
    }
    return null
  }

  async getNormalizedPosition(raceId: string) {
    return await this.ballotReadyService.fetchRaceNormalizedPosition(raceId)
  }

  async getRacesByZip({
    zipcode,
    level,
    electionDate,
  }: RacesByZipSchema): Promise<RaceNode[]> {
    try {
      const existingPositions: Set<string> = new Set()
      const elections: RaceNode[] = []
      const primaryElectionDates: Record<
        string,
        {
          electionDay: string
          primaryElectionId: string
        }
      > = {}
      let hasNextPage = true
      let iterationCount = 0
      const MAX_ITERATIONS = 50 // Safety limit to prevent infinite loops
      const TIMEOUT_MS = 15 * 1000 // 15 second timeout
      const startTime = Date.now()

      let nextRacesPromise = this.ballotReadyService.fetchRacesByZipcode(
        zipcode,
        level,
        electionDate,
      )

      while (hasNextPage && iterationCount < MAX_ITERATIONS) {
        // Check timeout
        if (Date.now() - startTime > TIMEOUT_MS) {
          this.logger.warn(
            `Timeout reached (${TIMEOUT_MS}ms) for zipcode ${zipcode}. Returning ${elections.length} elections loaded so far.`,
          )
          break
        }

        iterationCount++
        this.logger.debug(
          `Iteration ${iterationCount}: hasNextPage=${hasNextPage}, elections=${elections.length}`,
        )

        // Wait for the API response
        const queryResponse = await nextRacesPromise
        if (!queryResponse) {
          throw new InternalServerErrorException(
            'Could not fetch data from BallotReady',
          )
        }
        const races = queryResponse.races
        if (races?.edges) {
          hasNextPage = races.pageInfo.hasNextPage
          const startCursor = races.pageInfo.endCursor ?? null

          this.logger.debug(
            {
              hasNextPage,
              endCursor: startCursor,
              edgesCount: races.edges.length,
              totalElectionsSoFar: elections.length,
            },
            `Iteration ${iterationCount}: pageInfo`,
          )

          // Start the next API request while parsing
          nextRacesPromise = hasNextPage
            ? this.ballotReadyService.fetchRacesByZipcode(
                zipcode,
                level,
                electionDate,
                startCursor,
              )
            : Promise.resolve(null)

          parseRaces(races, existingPositions, elections, primaryElectionDates)
        } else {
          hasNextPage = false
        }
      }

      if (iterationCount >= MAX_ITERATIONS) {
        this.logger.warn(
          `Reached maximum iteration limit (${MAX_ITERATIONS}) for zipcode ${zipcode}. This may indicate a very large dataset or potential infinite loop.`,
        )
      }

      try {
        await this.attachCitiesToRaces(elections)
      } catch (e) {
        this.logger.error({ e }, 'failed to attach cities to races')
      }

      const totalTime = Date.now() - startTime
      this.logger.debug(
        `Completed: ${iterationCount} iterations, ${elections.length} elections in ${totalTime}ms`,
      )

      return elections
    } catch (e) {
      this.logger.error({ e }, 'error at getRacesByZip')
      throw new InternalServerErrorException('Error getting races by zipcode')
    }
  }

  private normalizeGeoId(geoId?: string | null): string | null {
    if (!geoId) return null
    const parsed = parseInt(geoId, 10)
    if (Number.isNaN(parsed)) return null
    return parsed.toString()
  }

  private raceCensusKey(
    race: RaceNode,
  ): { key: string; mtfcc: string; geoId: string } | null {
    const mtfcc = race?.position?.mtfcc
    const geoId = this.normalizeGeoId(race?.position?.geoId)
    if (!mtfcc || !geoId) return null
    return { key: `${mtfcc}|${geoId}`, mtfcc, geoId }
  }

  private async attachCitiesToRaces(elections: RaceNode[]): Promise<void> {
    const lookups = new Map<string, { mtfcc: string; geoId: string }>()
    for (const race of elections) {
      const pair = this.raceCensusKey(race)
      if (pair) {
        lookups.set(pair.key, { mtfcc: pair.mtfcc, geoId: pair.geoId })
      }
    }
    if (lookups.size === 0) return

    const censusRows = await this.censusEntities.findMany({
      where: {
        OR: Array.from(lookups.values()),
      },
    })

    const cityByKey = new Map<string, string>()
    for (const row of censusRows) {
      const key = `${row.mtfcc}|${row.geoId}`
      if (cityByKey.has(key)) continue
      const city = extractCityFromGeoData(censusRowToGeoData(row))
      if (city) cityByKey.set(key, city)
    }

    for (const race of elections) {
      const pair = this.raceCensusKey(race)
      const city = pair && cityByKey.get(pair.key)
      if (city) race.city = city
    }
  }

  private getRaceLevel(level: string) {
    // this helper just simplifies level to city/state/county/federal.
    // it is used in p2v.
    // from this larger list:
    // "level"
    // "city"
    // "county"
    // "federal"
    // "local"
    // "regional"
    // "state"
    // "town"
    // "township"
    // "village"

    level = level.toLowerCase()
    if (
      level &&
      level !== 'federal' &&
      level !== 'state' &&
      level !== 'county' &&
      level !== 'city'
    ) {
      level = 'city'
    }
    return level
  }

  private async resolveMtfcc(geoId: string, mtfcc: string) {
    const normalizedGeoId = this.normalizeGeoId(geoId)
    if (!mtfcc || !normalizedGeoId) return undefined
    const census = await this.censusEntities.findFirst({
      where: {
        geoId: normalizedGeoId,
        mtfcc,
      },
    })
    return census ? censusRowToGeoData(census) : undefined
  }

  // todo: split this function into smaller functions
  async getRaceDetails(
    raceId: string,
    slug: string,
    zip?: string | null,
    findElectionDates = true,
  ) {
    const data: Record<
      string,
      string | number | boolean | GeoData | string[] | undefined
    > = {}

    this.logger.debug({ slug }, 'getting race from ballotReady api...')

    let race: RacesByIdNode['node'] | null
    try {
      race = await this.getRaceById(raceId)
    } catch (e) {
      this.logger.error({ slug, e }, 'error getting race details')
      return
    }
    this.logger.debug({ slug }, 'got ballotReady Race')

    let electionDate: string | undefined
    let termLength = 4
    let level = 'city'
    let positionId: string | undefined
    let mtfcc: string | undefined | null
    let geoId: string | undefined | null
    let tier: string | number | undefined

    try {
      // BallotReady API response field is untyped — validated with typeof check on next line
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const rawElectionDay = race?.election?.electionDay
      electionDate =
        typeof rawElectionDay === 'string' ? rawElectionDay : undefined
      termLength =
        race?.position?.electionFrequencies[0]?.frequency[0] ?? termLength
      level = race?.position?.level?.toLowerCase() ?? level
      positionId = race?.position?.id
      mtfcc = race?.position.mtfcc
      geoId = race?.position.geoId
      tier = race?.position.tier
    } catch (e) {
      this.logger.error({ slug, e }, 'error getting election date')
    }
    if (!electionDate) {
      return
    }

    let electionLevel = 'city'
    try {
      electionLevel = this.getRaceLevel(level)
    } catch (e) {
      this.logger.error({ slug, e }, 'error getting election level')
    }
    this.logger.debug({ slug, electionLevel }, 'electionLevel')

    const officeName = race?.position?.name
    if (!officeName) {
      this.logger.error({ slug }, 'error getting office name')
      return
    }

    const partisanType = race?.position?.partisanType
    const subAreaName =
      race?.position?.subAreaName && race.position.subAreaName !== 'null'
        ? race.position.subAreaName
        : undefined
    const subAreaValue =
      race?.position?.subAreaValue && race.position.subAreaValue !== 'null'
        ? race.position.subAreaValue
        : undefined
    const electionState = race?.election?.state

    let locationResp: Record<string, string> | false | undefined
    let county: string | undefined
    let city: string | undefined

    if (level !== 'state' && level !== 'federal') {
      // We use the mtfcc and geoId to get the city and county
      // and a more accurate electionLevel
      this.logger.debug({ slug }, `mtfcc: ${mtfcc}, geoId: ${geoId}`)
      if (mtfcc && geoId) {
        const geoData = await this.resolveMtfcc(mtfcc, geoId)
        this.logger.debug({ slug, geoData }, 'geoData')

        const pickedCity = extractCityFromGeoData(geoData)
        if (pickedCity) city = pickedCity

        if (geoData?.city && electionLevel !== 'city') {
          electionLevel = 'city'
        }
        if (geoData?.county && electionLevel !== 'county') {
          county = geoData.county
          electionLevel = 'county'
        }
        if (geoData?.state && electionLevel !== 'state') {
          electionLevel = 'state'
        }
        // TODO: electionLevel='local' could cause issues upstream
        // so we are leaving electionLevel as city for now.
        if (
          geoData?.township ||
          geoData?.town ||
          geoData?.village ||
          geoData?.borough
        ) {
          electionLevel = 'city'
        }
      }

      if (county && county !== '') {
        county = county.replace(/ County$/, '')
      }

      if (
        (electionLevel === 'city' && !city) ||
        (electionLevel === 'county' && !county)
      ) {
        this.logger.debug(
          { slug },
          'could not find location from mtfcc. getting location from AI',
        )

        // If we couldn't get city/county with mtfcc/geo then use the AI.
        locationResp = await this.extractLocationAi(
          officeName + ' - ' + electionState,
          level,
        )
        this.logger.debug(
          {
            slug,
            locationResp,
          },
          'locationResp',
        )
      }

      if (typeof locationResp === 'object' && locationResp.level) {
        if (locationResp.level === 'county') {
          county = locationResp.county
        } else {
          if (locationResp.county && locationResp.level in locationResp) {
            city = locationResp[locationResp.level]
            county = locationResp.county
          }
        }
      }
    }

    if (county) {
      this.logger.debug({ slug, county }, 'Found county')
    }
    if (city) {
      this.logger.debug({ slug, city }, 'Found city')
    }

    let priorElectionDates: string[] = []
    if (partisanType !== 'partisan' && findElectionDates) {
      // todo: restore this code once we have Position / BallotPosition
      // if (positionId) {
      //   const ballotPosition = await BallotPosition.findOne({
      //     ballotHashId: positionId.toString(),
      //   })
      //   if (ballotPosition && ballotPosition?.ballotId) {
      //     const ballotPositionId = ballotPosition?.ballotId
      //     priorElectionDates = await getElectionDatesPosition(
      //       slug,
      //       ballotPositionId,
      //     )
      //     logger.log(
      //       `priorElectionDates from PositionId ${ballotPositionId} `,
      //       priorElectionDates,
      //     )
      //   }
      // }

      const positionLevel = race?.position?.level
      if (
        (!priorElectionDates || priorElectionDates.length === 0) &&
        zip &&
        positionLevel
      ) {
        priorElectionDates = await this.getElectionDates(
          slug,
          officeName,
          zip,
          positionLevel,
        )
      }
    }

    data.slug = slug
    data.officeName = officeName
    data.electionDate = electionDate
    data.electionTerm = termLength
    data.electionLevel = electionLevel
    data.electionState = electionState ?? undefined
    data.electionCounty = county
    data.electionMunicipality = city
    data.subAreaName = subAreaName
    data.subAreaValue = subAreaValue
    data.partisanType = partisanType ?? undefined
    data.priorElectionDates = priorElectionDates
    data.positionId = positionId
    data.tier = tier
    return data
  }

  private async extractLocationAi(office: string, level: string) {
    level = level.toLowerCase()

    if (level === 'local' || level === 'regional') {
      // if the level is local or regional, we need to refine the level
      if (office.includes('Village')) {
        level = 'village'
      } else if (office.includes('Township')) {
        level = 'township'
      } else if (office.includes('Town')) {
        level = 'town'
      } else if (
        office.includes('City') ||
        office.includes('Municipal') ||
        office.includes('Borough')
      ) {
        level = 'city'
      } else if (office.includes('County') || office.includes('Parish')) {
        level = 'county'
      } else {
        // default to city if we can't determine the local level
        level = 'city'
      }
    }

    const toolProperties: Record<
      string,
      { type: string; description: string }
    > = {}
    let systemPrompt: string | undefined
    if (level === 'county') {
      systemPrompt = COUNTY_PROMPT
    } else if (level === 'city') {
      systemPrompt = CITY_PROMPT
      toolProperties.city = {
        type: 'string',
        description: 'The city name.',
      }
    } else if (level === 'town') {
      systemPrompt = TOWN_PROMPT
      toolProperties.town = {
        type: 'string',
        description: 'The town name.',
      }
    } else if (level === 'township') {
      systemPrompt = TOWNSHIP_PROMPT
      toolProperties.township = {
        type: 'string',
        description: 'The township name.',
      }
    } else if (level === 'village') {
      systemPrompt = VILLAGE_PROMPT
      toolProperties.village = {
        type: 'string',
        description: 'The village name.',
      }
    } else {
      return false
    }

    // we always try to get the county name
    toolProperties.county = {
      type: 'string',
      description: 'The county name.',
    }

    const tool: ChatCompletionTool = {
      type: 'function',
      function: {
        name: 'extractLocation',
        description: 'Extract the location from the office name.',
        parameters: {
          type: 'object',
          properties: toolProperties,
        },
      },
    }

    const messages: AiChatMessage[] = [
      {
        role: 'system',
        content: systemPrompt,
      },
      {
        role: 'user',
        content: `Input: "${office}"
          Output:`,
      },
    ]

    const toolChoice: ChatCompletionNamedToolChoice = {
      type: 'function',
      function: { name: 'extractLocation' },
    }

    const completion = await this.ai.getChatToolCompletion({
      messages,
      tool,
      toolChoice,
    })

    this.logger.debug(
      `messages: ${messages}. tool: ${tool}. toolChoice: ${toolChoice}`,
    )

    const content = completion?.content
    let decodedContent: Record<string, string> = {}
    try {
      // JSON.parse returns unknown — no way to infer parsed shape at compile time
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      decodedContent = JSON.parse(content) as Record<string, string>
      decodedContent.level = level
    } catch (e) {
      this.logger.debug({ e }, 'error at extract-location-ai helper')
    }
    this.logger.debug(decodedContent, 'extract ai location response')
    return decodedContent
  }

  private async getElectionDates(
    slug: string,
    officeName: string,
    zip: string,
    level: PositionLevel,
  ) {
    const electionDates: string[] = []
    try {
      const ballotReadyData =
        await this.ballotReadyService.fetchRacesWithElectionDates(zip, level)
      if (!ballotReadyData) {
        throw new InternalServerErrorException(
          'Could not fetch BallotReady data',
        )
      }
      const { races } = ballotReadyData
      const results = races?.edges || []
      for (let i = 0; i < results.length; i++) {
        const result = results[i]
        const { position, election } = result.node
        if (position?.name && election?.electionDay) {
          if (position.name.toLowerCase() === officeName.toLowerCase()) {
            if (!electionDates.includes(String(election.electionDay))) {
              electionDates.push(String(election.electionDay))
            }
          }
        }
      }
      this.logger.debug({ slug, electionDates }, 'electionDates')

      return electionDates
    } catch (e) {
      this.logger.error({ slug, e }, 'error at getElectionDates')
      return []
    }
  }
}
