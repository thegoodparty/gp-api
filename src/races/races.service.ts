import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from 'src/prisma/prisma.service'
import { GraphqlService } from 'src/graphql/graphql.service'
import slugify from 'slugify'
import { startOfYear, addYears, format } from 'date-fns'
import { County, Municipality } from '@prisma/client'
import { NormalizedRace, Race, RaceData, RaceQuery } from './races.types'
import {
  COUNTY_PROMPT,
  CITY_PROMPT,
  TOWN_PROMPT,
  TOWNSHIP_PROMPT,
  VILLAGE_PROMPT,
} from './constants/prompts.consts'

@Injectable()
export class RacesService {
  private readonly logger = new Logger(RacesService.name)
  constructor(
    private prisma: PrismaService,
    private graphQLService: GraphqlService,
  ) {}

  async findRaces(
    state?: string,
    county?: string,
    city?: string,
    positionSlug?: string,
  ): Promise<NormalizedRace[]> {
    if (state && county && city && positionSlug) {
      const singleRace = await this.findOne(state, county, city, positionSlug)
      return singleRace ? [singleRace] : []
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
    const query = {
      state: state.toUpperCase(),
      positionSlug,
      electionDate: {
        gte: new Date(now),
        lt: new Date(nextYear),
      },
    } as RaceQuery

    if (city && cityRecord) {
      query.municipalityId = cityRecord.id
    } else if (countyRecord) {
      query.countyId = countyRecord.id
    }
    const race = (await this.prisma.race.findFirst({
      where: query,
      orderBy: {
        electionDate: 'asc',
      },
    })) as Race

    if (!race) {
      return null
    }

    race.municipality = cityRecord
    race.county = countyRecord

    return this.normalizeRace(race, state)
  }

  async byCity(state: string, county: string, city: string) {
    const countyRecord = await this.getCounty(state, county)
    const municipalityRecord = await this.getMunicipality(state, county, city)
    if (!countyRecord && !municipalityRecord) {
      return []
    }

    const nextYear = format(addYears(startOfYear(new Date()), 2), 'M d, yyyy')

    const now = format(new Date(), 'M d, yyyy')

    const races = await this.prisma.race.findMany({
      where: {
        state: state.toUpperCase(),
        municipalityId: municipalityRecord?.id,
        electionDate: {
          gte: new Date(now),
          lt: new Date(nextYear),
        },
      },
      // select: { data: true, hashId: true, positionSlug: true, countyId: true },
      orderBy: {
        electionDate: 'asc',
      },
    })

    return this.deduplicateRaces(
      races as Race[],
      state,
      countyRecord,
      municipalityRecord,
    )
  }

  async byCounty(state: string, county: string) {
    const countyRecord = await this.getCounty(state, county)
    if (!countyRecord) {
      return []
    }

    const nextYear = format(addYears(startOfYear(new Date()), 2), 'M d, yyyy')

    const now = format(new Date(), 'M d, yyyy')

    const races = await this.prisma.race.findMany({
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

    const races = await this.prisma.race.findMany({
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

  private normalizeRace(race: Race, state: string): NormalizedRace {
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
    } = race.data as RaceData

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
      frequency,
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
    return this.prisma.county.findUnique({
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
    return this.prisma.municipality.findUnique({
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
        } = data as RaceData

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
    let geoData: any
    // geoId is a string that an start with 0, so we need remove that 0
    if (geoId) {
      geoId = parseInt(geoId, 10).toString()
    }
    if (mtfcc && geoId) {
      const census = await this.prisma.censusEntity.findFirst({
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

        // if (census.mtfccType !== 'State or Equivalent Feature') {
        //   geoData.city = census.name;
        // }
        if (census.mtfccType === 'Incorporated Place') {
          geoData.city = census.name
        } else if (census.mtfccType === 'County or Equivalent Feature') {
          // todo: strip County from name.
          geoData.county = census.name
        } else if (census.mtfccType === 'State or Equivalent Feature') {
          geoData.state = census.name
        } else if (census.mtfccType === 'County Subdivision') {
          if (census.name.toLowerCase().includes('township')) {
            geoData.township = census.name
          } else if (census.name.toLowerCase().includes('town')) {
            geoData.town = census.name
          } else if (census.name.toLowerCase().includes('city')) {
            geoData.city = census.name
          } else if (census.name.toLowerCase().includes('village')) {
            geoData.village = census.name
          } else if (census.name.toLowerCase().includes('borough')) {
            geoData.borough = census.name
          }
        }
      }
    }
    return geoData
  }

  private async getRaceDetails(
    raceId: string,
    slug: string,
    zip: string,
    findElectionDates = true,
  ) {
    const logger = new Logger('getRaceDetails')
    const data: any = {}

    logger.log(slug, 'getting race from ballotReady api...')

    let race: any
    try {
      race = await this.getRaceById(raceId)
    } catch (e) {
      logger.error(slug, 'error getting race details', e)
      return
    }
    logger.log(slug, 'got ballotReady Race')

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
      logger.error(slug, 'error getting election date', e)
    }
    if (!electionDate) {
      return
    }

    let electionLevel = 'city'
    try {
      electionLevel = this.getRaceLevel(level)
    } catch (e) {
      logger.error(slug, 'error getting election level', e)
    }
    logger.log(slug, 'electionLevel', electionLevel)

    const officeName = race?.position?.name
    if (!officeName) {
      logger.error(slug, 'error getting office name')
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
      logger.log(slug, `mtfcc: ${mtfcc}, geoId: ${geoId}`)
      if (mtfcc && geoId) {
        const geoData: any = await this.resolveMtfcc(mtfcc, geoId)
        logger.log(slug, 'geoData', geoData)
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
        logger.log(
          slug,
          'could not find location from mtfcc. getting location from AI',
        )

        // If we couldn't get city/county with mtfcc/geo then use the AI.
        locationResp = await this.extractLocationAi(
          officeName + ' - ' + electionState,
          level,
        )
        logger.log(slug, 'locationResp', locationResp)
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
      logger.log(slug, 'Found county', county)
    }
    if (city) {
      logger.log(slug, 'Found city', city)
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
        logger.log(`priorElectionDates from zip ${zip}`, priorElectionDates)
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

    const messages = [
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

    let completion
    // todo: once the ai service is up, we can use this code
    // const completion = await getChatToolCompletion(
    //   messages,
    //   0.1,
    //   0.1,
    //   tool,
    //   toolChoice,
    // )

    this.logger.log(
      `messages: ${messages}. tool: ${tool}. toolChoice: ${toolChoice}`,
    )

    // console.log('completion', completion);
    const content = completion?.content
    let decodedContent: any = {}
    try {
      decodedContent = JSON.parse(content)
      decodedContent.level = level
    } catch (e) {
      console.log('error at extract-location-ai helper', e)
    }
    console.log('extract ai location response', decodedContent)
    return decodedContent
  }

  private async getElectionDates(
    slug: string,
    officeName: string,
    zip: string,
    level: string,
  ) {
    const electionDates: string[] = []
    const logger = new Logger('getElectionDates')
    try {
      // get todays date in format YYYY-MM-DD
      const today = new Date()
      const year = today.getFullYear()
      const month = (today.getMonth() + 1).toString().padStart(2, '0')
      const day = today.getDate().toString().padStart(2, '0')
      const dateToday = `${year}-${month}-${day}`

      const query = `
            query {
                races(
                    location: { zip: "${zip}" }
                    filterBy: { electionDay: { gt: "2006-01-01", lt: "${dateToday}" }, level: ${level} }
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

      const { races } = await this.graphQLService.fetchGraphql(query)
      logger.log(slug, 'getElectionDates graphql result', races)
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
      logger.log(slug, 'electionDates', electionDates)

      return electionDates
    } catch (e) {
      logger.error(slug, 'error at getElectionDates', e)
      return []
    }
  }

  private async getRaceById(raceId: string) {
    const query = `
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
    const { node } = await this.graphQLService.fetchGraphql(query)
    return node
  }
}
