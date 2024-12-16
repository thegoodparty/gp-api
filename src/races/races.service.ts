import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/prisma/prisma.service'
import slugify from 'slugify'
import { startOfYear, addYears, format } from 'date-fns'

import { County, Municipality } from '@prisma/client'
import { NormalizedRace, Race, RaceData, RaceQuery } from './races.types'

@Injectable()
export class RacesService {
  constructor(private prisma: PrismaService) {}

  async findRaces(
    state?: string,
    county?: string,
    city?: string,
    positionSlug?: string,
  ): Promise<NormalizedRace[]> {
    let result: NormalizedRace | NormalizedRace[] | null = null
    if (state && county && city && positionSlug) {
      result = await this.findOne(state, county, city, positionSlug)
    }

    if (state && county && city) {
      result = await this.byCity(state, county, city)
    }

    if (state && county) {
      result = await this.byCounty(state, county)
    }

    if (state) {
      result = await this.byState(state)
    }

    // Ensure we always return an array for consistency
    return !result ? [] : Array.isArray(result) ? result : [result]
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
      return null
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
      return null
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
  // select: { data: true, hashId: true, positionSlug: true, countyId: true }
  private deduplicateRaces(
    races: Race[],
    state: string,
    county?: County | null,
    city?: Municipality | null,
  ): NormalizedRace[] {
    const uniqueRaces = new Map<string, NormalizedRace>()

    races.forEach((race) => {
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

        // race.electionName = election_name
        // race.date = election_day
        // race.normalizedPositionName = normalized_position_name
        // race.positionDescription = position_description
        // race.level = level
        // race.positionSlug = positionSlug
        // race.state = state
        // race.county = county
        // race.city = city

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
    })

    return Array.from(uniqueRaces.values())
  }
}
