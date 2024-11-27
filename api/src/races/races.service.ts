import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/prisma/prisma.service'
import slugify from 'slugify'
import * as moment from 'moment'

import { Race, County, Municipality } from '@prisma/client'

interface ExtendedRace extends Race {
  municipality?: any
  county?: any
  data: any
}

@Injectable()
export class RacesService {
  constructor(private prisma: PrismaService) {}

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
    const nextYear = moment().startOf('year').add(2, 'year').format('M D, YYYY')

    const now = moment().format('M D, YYYY')
    const query = {
      state: state.toUpperCase(),
      positionSlug,
      electionDate: {
        gte: new Date(now),
        lt: new Date(nextYear),
      },
    }
    if (city && cityRecord) {
      query['municipalityId'] = cityRecord.id
    } else if (countyRecord) {
      query['countyId'] = countyRecord.id
    }
    const races = (await this.prisma.race.findMany({
      where: query,
      orderBy: {
        electionDate: 'asc',
      },
    })) as ExtendedRace[]

    if (races.length === 0) {
      return false
    }

    const race = races[0]

    race.municipality = cityRecord
    race.county = countyRecord

    const cleanRace = this.filterRace(race, state)

    return cleanRace
  }

  async byCity(state: string, county: string, city: string) {
    const countyRecord = await this.getCounty(state, county)
    const municipalityRecord = await this.getMunicipality(state, county, city)
    if (!countyRecord || !municipalityRecord) {
      return false
    }

    const nextYear = moment().startOf('year').add(2, 'year').format('M D, YYYY')

    const now = moment().format('M D, YYYY')

    const races = await this.prisma.race.findMany({
      where: {
        state: state.toUpperCase(),
        municipalityId: municipalityRecord.id,
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

    const dedupedRaces = this.deduplicateRaces(
      races,
      state,
      countyRecord,
      municipalityRecord,
    )

    return dedupedRaces
  }

  private filterRace(race: ExtendedRace, state: string) {
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

    const filtered = {
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
      isPriamry: is_primary,
      municipality: race.municipality
        ? { name: race.municipality.name, slug: race.municipality.slug }
        : null,
      county: race.county
        ? { name: race.county.name, slug: race.county.slug }
        : null,
    }
    return filtered
  }

  private async getCounty(
    state: string,
    county: string,
  ): Promise<County | null> {
    const slug = `${slugify(state, { lower: true })}/${slugify(county, {
      lower: true,
    })}`
    return await this.prisma.county.findUnique({
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
    return await this.prisma.municipality.findUnique({
      where: { slug },
    })
  }

  private deduplicateRaces(
    races: any,
    state: string,
    county: County,
    city: Municipality,
  ) {
    const uniqueRaces = new Map<string, any>()

    races.forEach((race) => {
      if (!uniqueRaces.has(race.positionSlug)) {
        const { data, positionSlug } = race
        const {
          election_name,
          election_day,
          normalized_position_name,
          position_description,
          level,
        } = data

        race.electionName = election_name
        race.date = election_day
        race.normalizedPositionName = normalized_position_name
        race.positionDescription = position_description
        race.level = level
        race.positionSlug = positionSlug
        race.state = state
        race.county = county
        race.city = city

        delete race.data
        uniqueRaces.set(race.positionSlug, race)
      }
    })

    return Array.from(uniqueRaces.values())
  }
}
