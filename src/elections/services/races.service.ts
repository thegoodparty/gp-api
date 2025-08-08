import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common'
import { GeoData } from '../types/elections.types'
import {
  CITY_PROMPT,
  COUNTY_PROMPT,
  TOWN_PROMPT,
  TOWNSHIP_PROMPT,
  VILLAGE_PROMPT,
} from '../constants/prompts.consts'
import { GEO_TYPES, MTFCC_TYPES } from '../constants/geo.consts'
import { CensusEntitiesService } from './censusEntities.service'
import { BallotReadyService } from './ballotReady.service'
import { PositionLevel } from 'src/generated/graphql.types'
import { AiService } from '../../ai/ai.service'
import { AiChatMessage } from '../../campaigns/ai/chat/aiChat.types'
import { parseRaces } from '../util/parseRaces.util'
import { RaceNode } from '../types/ballotReady.types'
import { RacesByZipSchema } from '../schemas/RacesByZip.schema'

@Injectable()
export class RacesService {
  private readonly logger = new Logger(RacesService.name)
  constructor(
    private readonly censusEntities: CensusEntitiesService,
    private readonly ballotReadyService: BallotReadyService,
    private readonly ai: AiService,
  ) {}

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

          this.logger.debug(`Iteration ${iterationCount}: pageInfo`, {
            hasNextPage,
            endCursor: startCursor,
            edgesCount: races.edges.length,
            totalElectionsSoFar: elections.length,
          })

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

      const totalTime = Date.now() - startTime
      this.logger.debug(
        `Completed: ${iterationCount} iterations, ${elections.length} elections in ${totalTime}ms`,
      )

      return elections
    } catch (e) {
      this.logger.error('error at getRacesByZip', e)
      throw new InternalServerErrorException('Error getting races by zipcode')
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
    let geoData: GeoData | undefined
    // geoId is a string that an start with 0, so we need remove that 0
    if (geoId) {
      geoId = parseInt(geoId, 10).toString()
    }
    if (mtfcc && geoId) {
      const census = await this.censusEntities.findFirst({
        where: {
          geoId,
          mtfcc,
        },
      })
      if (census) {
        geoData = {
          name: census.name,
          type: census.mtfccType,
        }

        // todo: this can be improved for county recognition
        // and other types of entities (school board, etc)
        if (census.mtfccType === MTFCC_TYPES.CITY) {
          geoData.city = census.name
        } else if (census.mtfccType === MTFCC_TYPES.COUNTY) {
          // todo: strip County from name.
          geoData.county = census.name
        } else if (census.mtfccType === MTFCC_TYPES.STATE) {
          geoData.state = census.name
        } else if (census.mtfccType === MTFCC_TYPES.COUNTY_SUBDIVISION) {
          if (census.name.toLowerCase().includes(GEO_TYPES.TOWNSHIP)) {
            geoData.township = census.name
          } else if (census.name.toLowerCase().includes(GEO_TYPES.TOWN)) {
            geoData.town = census.name
          } else if (census.name.toLowerCase().includes(GEO_TYPES.CITY)) {
            geoData.city = census.name
          } else if (census.name.toLowerCase().includes(GEO_TYPES.VILLAGE)) {
            geoData.village = census.name
          } else if (census.name.toLowerCase().includes(GEO_TYPES.BOROUGH)) {
            geoData.borough = census.name
          }
        }
      }
    }
    return geoData
  }

  // todo: split this function into smaller functions
  async getRaceDetails(
    raceId: string,
    slug: string,
    zip?: string | null,
    findElectionDates = true,
  ) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {}

    this.logger.debug(slug, 'getting race from ballotReady api...')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let race: any
    try {
      race = await this.getRaceById(raceId)
    } catch (e) {
      this.logger.error(slug, 'error getting race details', e)
      return
    }
    this.logger.debug(slug, 'got ballotReady Race')

    let electionDate: string | undefined // the date of the election
    let termLength = 4
    let level = 'city'
    let positionId: string | undefined
    let mtfcc: string | undefined
    let geoId: string | undefined
    let tier: string | undefined

    try {
      electionDate = race?.election?.electionDay
      termLength = race?.position?.electionFrequencies[0].frequency[0]
      level = race?.position?.level.toLowerCase()
      positionId = race?.position.id
      mtfcc = race?.position.mtfcc
      geoId = race?.position.geoId
      tier = race?.position.tier
    } catch (e) {
      this.logger.error(slug, 'error getting election date', e)
    }
    if (!electionDate) {
      return
    }

    let electionLevel = 'city'
    try {
      electionLevel = this.getRaceLevel(level)
    } catch (e) {
      this.logger.error(slug, 'error getting election level', e)
    }
    this.logger.debug(slug, 'electionLevel', electionLevel)

    const officeName = race?.position?.name
    if (!officeName) {
      this.logger.error(slug, 'error getting office name')
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let locationResp: any
    let county: string | undefined
    let city: string | undefined

    if (level !== 'state' && level !== 'federal') {
      // We use the mtfcc and geoId to get the city and county
      // and a more accurate electionLevel
      this.logger.debug(slug, `mtfcc: ${mtfcc}, geoId: ${geoId}`)
      if (mtfcc && geoId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const geoData: any = await this.resolveMtfcc(mtfcc, geoId)
        this.logger.debug(slug, 'geoData', geoData)
        if (geoData?.city) {
          city = geoData.city
          if (electionLevel !== 'city') {
            electionLevel = 'city'
          }
        }
        if (geoData?.county) {
          if (electionLevel !== 'county') {
            county = geoData.county
            electionLevel = 'county'
          }
        }
        if (geoData?.state) {
          if (electionLevel !== 'state') {
            electionLevel = 'state'
          }
        }
        // TODO: electionLevel='local' could cause issues upstream
        // so we are leaving electionLevel as city for now.
        if (geoData?.township) {
          city = geoData.township
          // electionLevel = 'local';
          electionLevel = 'city'
        }
        if (geoData?.town) {
          city = geoData.town
          // electionLevel = 'local';
          electionLevel = 'city'
        }
        if (geoData?.village) {
          city = geoData.village
          // electionLevel = 'local';
          electionLevel = 'city'
        }
        if (geoData?.borough) {
          city = geoData.borough
          // electionLevel = 'local';
          electionLevel = 'city'
        }
      }

      if (city && city !== '') {
        city = city.replace(/ CCD$/, '')
        city = city.replace(/ City$/, '')
        // Note: we don't remove Town/Township/Village/Borough
        // because we want to keep that info for ai column matching.
      }
      if (county && county !== '') {
        county = county.replace(/ County$/, '')
      }

      if (
        (electionLevel === 'city' && !city) ||
        (electionLevel === 'county' && !county)
      ) {
        this.logger.debug(
          slug,
          'could not find location from mtfcc. getting location from AI',
        )

        // If we couldn't get city/county with mtfcc/geo then use the AI.
        locationResp = await this.extractLocationAi(
          officeName + ' - ' + electionState,
          level,
        )
        this.logger.debug(slug, 'locationResp', locationResp)
      }

      if (locationResp?.level) {
        if (locationResp.level === 'county') {
          county = locationResp.county
        } else {
          if (
            locationResp.county &&
            locationResp.hasOwnProperty(locationResp.level)
          ) {
            city = locationResp[locationResp.level]
            county = locationResp.county
          }
        }
      }
    }

    if (county) {
      this.logger.debug(slug, 'Found county', county)
    }
    if (city) {
      this.logger.debug(slug, 'Found city', city)
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

      if ((!priorElectionDates || priorElectionDates.length === 0) && zip) {
        priorElectionDates = await this.getElectionDates(
          slug,
          officeName,
          zip,
          race?.position?.level,
        )
      }
    }

    data.slug = slug
    data.officeName = officeName
    data.electionDate = electionDate
    data.electionTerm = termLength
    data.electionLevel = electionLevel
    data.electionState = electionState
    data.electionCounty = county
    data.electionMunicipality = city
    data.subAreaName = subAreaName
    data.subAreaValue = subAreaValue
    data.partisanType = partisanType
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tool: any = {
      type: 'function',
      function: {
        name: 'extractLocation',
        description: 'Extract the location from the office name.',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
    }
    let systemPrompt
    if (level === 'county') {
      systemPrompt = COUNTY_PROMPT
    } else if (level === 'city') {
      systemPrompt = CITY_PROMPT
      tool.function.parameters.properties.city = {
        type: 'string',
        description: 'The city name.',
      }
    } else if (level === 'town') {
      systemPrompt = TOWN_PROMPT
      tool.function.parameters.properties.town = {
        type: 'string',
        description: 'The town name.',
      }
    } else if (level === 'township') {
      systemPrompt = TOWNSHIP_PROMPT
      tool.function.parameters.properties.township = {
        type: 'string',
        description: 'The township name.',
      }
    } else if (level === 'village') {
      systemPrompt = VILLAGE_PROMPT
      tool.function.parameters.properties.village = {
        type: 'string',
        description: 'The village name.',
      }
    } else {
      return false
    }

    // we always try to get the county name
    tool.function.parameters.properties.county = {
      type: 'string',
      description: 'The county name.',
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toolChoice: any = {
      type: 'function',
      function: { name: 'extractLocation' },
    }

    const completion = await this.ai.getChatToolCompletion({
      messages,
      tool, // list of functions that could be called.
      toolChoice, // force the function to be called on every generation if needed.
    })

    this.logger.debug(
      `messages: ${messages}. tool: ${tool}. toolChoice: ${toolChoice}`,
    )

    const content = completion?.content
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let decodedContent: any = {}
    try {
      decodedContent = JSON.parse(content)
      decodedContent.level = level
    } catch (e) {
      this.logger.debug('error at extract-location-ai helper', e)
    }
    this.logger.debug('extract ai location response', decodedContent)
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
            if (!electionDates.includes(election.electionDay)) {
              electionDates.push(election.electionDay)
            }
          }
        }
      }
      this.logger.debug(slug, 'electionDates', electionDates)

      return electionDates
    } catch (e) {
      this.logger.error(slug, 'error at getElectionDates', e)
      return []
    }
  }
}
