import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common'
import slugify from 'slugify'
import { addYears, format, startOfYear } from 'date-fns'
import { County, Municipality, Prisma, Race } from '@prisma/client'
import {
  GeoData,
  MunicipalityResponse,
  NormalizedRace,
  ProximityCitiesResponseBody,
} from '../types/races.types'
import {
  CITY_PROMPT,
  COUNTY_PROMPT,
  TOWN_PROMPT,
  TOWNSHIP_PROMPT,
  VILLAGE_PROMPT,
} from '../constants/prompts.consts'
import { GEO_TYPES, MTFCC_TYPES } from '../constants/geo.consts'
import { CountiesService } from './counties.services'
import { MunicipalitiesService } from './municipalities.services'
import { CensusEntitiesService } from './censusEntities.services'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { BallotReadyService } from './ballotReady.service'
import { PositionLevel } from 'src/generated/graphql.types'
import { AiService } from '../../ai/ai.service'
import { AiChatMessage } from '../../campaigns/ai/chat/aiChat.types'

@Injectable()
export class RacesService extends createPrismaBase(MODELS.Race) {
  constructor(
    private readonly counties: CountiesService,
    private readonly municipalities: MunicipalitiesService,
    private readonly censusEntities: CensusEntitiesService,
    private readonly ballotReadyService: BallotReadyService,
    private readonly ai: AiService,
  ) {
    super()
  }

  async findRaces(
    state?: string,
    county?: string,
    city?: string,
    positionSlug?: string,
  ) {
    if (state && county && city && positionSlug) {
      return await this.findOne(state, county, city, positionSlug)
    }

    if (state && county && city) {
      return await this.byCity(state, county, city)
    }

    if (state && county) {
      return await this.byCounty(state, county)
    }

    if (state) {
      return await this.byState(state)
    }

    return []
  }

  async findOne(
    state: string,
    county: string,
    city: string,
    positionSlug: string,
  ) {
    let countyRecord: County | null | undefined
    let cityRecord: Municipality | null | undefined
    if (county) {
      countyRecord = await this.getCounty(state, county)
    }
    if (city && countyRecord) {
      cityRecord = await this.getMunicipality(state, county, city)
    }
    const nextYear = format(addYears(startOfYear(new Date()), 2), 'M d, yyyy')

    const now = format(new Date(), 'M d, yyyy')
    const query: Prisma.RaceWhereInput = {
      state: state.toUpperCase(),
      positionSlug,
      electionDate: {
        gte: new Date(now),
        lt: new Date(nextYear),
      },
    }

    if (city && cityRecord) {
      query.municipalityId = cityRecord.id
    } else if (countyRecord) {
      query.countyId = countyRecord.id
    }
    const races = await this.findMany({
      where: query,
      orderBy: {
        electionDate: 'asc',
      },
      include: {
        municipality: true,
        county: true,
      },
    })

    if (races.length === 0) {
      return null
    }

    const race = races[0]
    const positions: Array<string | undefined> = []
    for (let i = 0; i < races.length; i++) {
      positions.push(races[i].data.position_name)
    }

    let otherRaces: Race[] = []
    if (race.municipality) {
      otherRaces = await this.findMany({
        where: { municipalityId: race.municipality.id },
      })
    } else if (race.county) {
      otherRaces = await this.findMany({
        where: { countyId: race.county.id },
      })
    }

    return {
      race: this.normalizeRace(race, state),
      otherRaces: this.deduplicateRaces(
        otherRaces,
        state,
        race.county,
        race.municipality,
      ),
      positions,
    }
  }

  async getByHashId(hashId: string) {
    return await this.findFirst({
      where: {
        hashId,
      },
      include: {
        county: true,
        municipality: true,
      },
    })
  }

  async byCityProximity(
    state: string,
    city: string,
  ): Promise<ProximityCitiesResponseBody> {
    const messages: AiChatMessage[] = [
      {
        role: 'system',
        content:
          'You help me find close cities, and respond in JSON format that is parsable be JSON.parse().',
      },
      {
        role: 'user',
        content: `Given a city and state in the format "City, State", identify the two closest cities (excluding the provided city) to the specified location. Return the names of these two closest cities in a JSON array format, with each entry containing only the city name. Please ensure the response contains only the names of the two closest cities, without including their states or any additional text, in the specified JSON array format. The input city is ${city} in ${state} state. For example, if the input is "Springfield, Illinois", a correct output would be in the following format: ["CityName1", "CityName2"]. Don't add backticks or the string "json" before. just return the array as a string so I can perform JSON.parse() on the response
          The input city is ${city} in ${state} state.`,
      },
    ]

    const completion = await this.ai.llmChatCompletion(messages)

    const cities = completion.content
    const parsed: string[] = JSON.parse(cities)

    const municipalityRecord1: MunicipalityResponse | null =
      await this.municipalities.findFirst({
        where: {
          name: city,
          state,
        },
        select: {
          id: true,
          slug: true,
          name: true,
        },
      })

    const resultCities: MunicipalityResponse[] = []

    if (municipalityRecord1) {
      municipalityRecord1.openElections = await this.model.count({
        where: { municipalityId: municipalityRecord1.id },
      })
      municipalityRecord1.state = state
      resultCities.push(municipalityRecord1)
    }

    let municipalityRecord2: MunicipalityResponse | null = null
    let municipalityRecord3: MunicipalityResponse | null = null

    if (parsed.length > 0) {
      municipalityRecord2 = await this.municipalities.findFirst({
        where: {
          name: parsed[0],
          state,
        },
        select: {
          id: true,
          slug: true,
          name: true,
        },
      })
      if (municipalityRecord2) {
        municipalityRecord2.openElections = await this.model.count({
          where: { municipalityId: municipalityRecord2.id },
        })
        municipalityRecord2.state = state
        resultCities.push(municipalityRecord2)
      }
    }

    if (parsed.length > 1) {
      municipalityRecord3 = await this.municipalities.findFirst({
        where: {
          name: parsed[1],
          state,
        },
        select: {
          id: true,
          slug: true,
          name: true,
        },
      })
      if (municipalityRecord3) {
        municipalityRecord3.openElections = await this.model.count({
          where: { municipalityId: municipalityRecord3.id },
        })
        municipalityRecord3.state = state
        resultCities.push(municipalityRecord3)
      }
    }

    return {
      cities: resultCities,
      ...(parsed && parsed.length ? { parsed } : {}),
    }
  }

  async byCity(state: string, county: string, city: string) {
    const countyRecord = await this.getCounty(state, county)
    const municipalityRecord = await this.getMunicipality(state, county, city)
    if (!countyRecord || !municipalityRecord) {
      throw new BadRequestException('county and city are required')
    }

    const nextYear = format(addYears(startOfYear(new Date()), 2), 'M d, yyyy')

    const now = format(new Date(), 'M d, yyyy')

    const races = await this.findMany({
      where: {
        state: state.toUpperCase(),
        municipalityId: municipalityRecord?.id,
        electionDate: {
          gte: new Date(now),
          lt: new Date(nextYear),
        },
      },
      orderBy: {
        electionDate: 'asc',
      },
    })

    const {
      population,
      density,
      income_household_median,
      unemployment_rate,
      home_value,
      county_name,
      city: municipalityCity,
    } = municipalityRecord.data || {}

    const shortCity = {
      population,
      density,
      income_household_median,
      unemployment_rate,
      home_value,
      county_name,
      city: municipalityCity,
    }

    const deduplicatedRaces = this.deduplicateRaces(
      races as Race[],
      state,
      countyRecord,
      municipalityRecord,
    )

    return {
      races: deduplicatedRaces,
      municipality: shortCity,
    }
  }

  async byCounty(state: string, county: string) {
    const countyRecord = await this.getCounty(state, county)
    if (!countyRecord) {
      throw new BadRequestException('county is required')
    }

    const nextYear = format(addYears(startOfYear(new Date()), 2), 'M d, yyyy')

    const now = format(new Date(), 'M d, yyyy')

    const races = await this.findMany({
      where: {
        state: state.toUpperCase(),
        countyId: countyRecord?.id,
        level: 'county',
        electionDate: {
          gte: new Date(now),
          lt: new Date(nextYear),
        },
      },
      select: { data: true, hashId: true, positionSlug: true, countyId: true },
      orderBy: {
        electionDate: 'asc',
      },
    })
    return this.deduplicateRaces(races as Race[], state, countyRecord)
  }

  async byState(state: string) {
    const nextYear = format(addYears(startOfYear(new Date()), 2), 'M d, yyyy')

    const now = format(new Date(), 'M d, yyyy')

    const races = await this.findMany({
      where: {
        state: state.toUpperCase(),
        level: 'state',
        electionDate: {
          gte: new Date(now),
          lt: new Date(nextYear),
        },
      },
      select: { data: true, hashId: true, positionSlug: true, countyId: true },
      orderBy: {
        electionDate: 'asc',
      },
    })

    return this.deduplicateRaces(races as Race[], state)
  }

  private normalizeRace(
    race: Prisma.RaceGetPayload<{
      include: { county: true; municipality: true }
    }>,
    state: string,
  ): NormalizedRace {
    const {
      election_name,
      position_name,
      election_day,
      level,
      partisan_type,
      salary,
      employment_type,
      filing_date_start,
      filing_date_end,
      normalized_position_name,
      position_description,
      frequency,
      filing_office_address,
      filing_phone_number,
      paperwork_instructions,
      filing_requirements,
      eligibility_requirements,
      is_runoff,
      is_primary,
    } = race.data

    return {
      ...race,
      ballotHashId: race.hashId,
      hashId: race.hashId,
      positionName: position_name,
      electionDate: election_day,
      electionName: election_name,
      state,
      level,
      partisanType: partisan_type,
      salary,
      employmentType: employment_type,
      filingDateStart: filing_date_start,
      filingDateEnd: filing_date_end,
      normalizedPositionName: normalized_position_name,
      positionDescription: position_description,
      ...(frequency ? { frequency } : {}),
      subAreaName: race.subAreaName,
      subAreaValue: race.subAreaValue,
      filingOfficeAddress: filing_office_address,
      filingPhoneNumber: filing_phone_number,
      paperworkInstructions: paperwork_instructions,
      filingRequirements: filing_requirements,
      eligibilityRequirements: eligibility_requirements,
      isRunoff: is_runoff,
      isPrimary: is_primary,
      municipality: race.municipality
        ? { name: race.municipality.name, slug: race.municipality.slug }
        : null,
      county: race.county
        ? { name: race.county.name, slug: race.county.slug }
        : null,
    }
  }

  private async getCounty(
    state: string,
    county: string,
  ): Promise<County | null> {
    const slug = `${slugify(state, { lower: true })}/${slugify(county, {
      lower: true,
    })}`
    return this.counties.findUnique({
      where: { slug },
    })
  }

  private async getMunicipality(
    state: string,
    county: string,
    city: string,
  ): Promise<Municipality | null> {
    const slug = `${slugify(state, { lower: true })}/${slugify(county, {
      lower: true,
    })}/${slugify(city, {
      lower: true,
    })}`
    return this.municipalities.findUnique({
      where: { slug },
    })
  }

  private deduplicateRaces(
    races: Race[],
    state: string,
    county?: County | null,
    city?: Municipality | null,
  ): NormalizedRace[] {
    const uniqueRaces = new Map<string, NormalizedRace>()

    for (const race of races) {
      if (!race.positionSlug || !uniqueRaces.has(race.positionSlug)) {
        const { data, positionSlug, ...withoutData } = race
        const {
          election_name,
          election_day,
          normalized_position_name,
          position_description,
          level,
          frequency,
        } = data

        uniqueRaces.set(positionSlug as string, {
          ...withoutData,
          electionDate: election_day,
          electionName: election_name,
          date: election_day,
          normalizedPositionName: normalized_position_name,
          positionDescription: position_description,
          level,
          positionSlug: positionSlug,
          state: state,
          county: county,
          municipality: city,
          frequency,
        })
      }
    }

    return [...uniqueRaces.values()]
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
  private async getRaceDetails(
    raceId: string,
    slug: string,
    zip: string,
    findElectionDates = true,
  ) {
    const data: any = {}

    this.logger.debug(slug, 'getting race from ballotReady api...')

    let race: any
    try {
      race = await this.ballotReadyService.fetchRaceById(raceId)
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

    let locationResp: any
    let county: string | undefined
    let city: string | undefined

    if (level !== 'state' && level !== 'federal') {
      // We use the mtfcc and geoId to get the city and county
      // and a more accurate electionLevel
      this.logger.debug(slug, `mtfcc: ${mtfcc}, geoId: ${geoId}`)
      if (mtfcc && geoId) {
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

    const toolChoice: any = {
      type: 'function',
      function: { name: 'extractLocation' },
    }

    // TODO: once the ai service is up, we can use this code
    const completion = await this.ai.getChatToolCompletion({
      messages,
      tool, // list of functions that could be called.
      toolChoice, // force the function to be called on every generation if needed.
    })

    this.logger.debug(
      `messages: ${messages}. tool: ${tool}. toolChoice: ${toolChoice}`,
    )

    const content = completion?.content
    let decodedContent: any = {}
    try {
      decodedContent = JSON.parse(content)
      decodedContent.level = level
    } catch (e) {
      console.debug('error at extract-location-ai helper', e)
    }
    console.debug('extract ai location response', decodedContent)
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
      this.logger.debug(slug, 'getElectionDates graphql result', races)
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
