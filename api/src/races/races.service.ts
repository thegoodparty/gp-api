import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/prisma/prisma.service'
import {
  countiesSeedData,
  municipalitiesSeedData,
  RaceData,
  racesSeedData,
} from './races.seed2'
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

    // const otherRaces = await this.getOtherRaces(race)

    return {
      race: cleanRace,
      // otherRaces,
    }
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

    const dedupedRaced = this.deduplicateRaces(
      races,
      state,
      countyRecord,
      municipalityRecord,
    )

    const {
      population,
      density,
      income_household_median,
      unemployment_rate,
      home_value,
      county_name,
    } = municipalityRecord.data as any

    const shortCity = {
      population,
      density,
      income_household_median,
      unemployment_rate,
      home_value,
      county_name,
      city: (municipalityRecord.data as any).city,
    }

    return {
      races: dedupedRaced,
      municipality: shortCity,
    }
  }

  async seed() {
    const counties: Record<string, string> = {}
    const municipalities: Record<string, string> = {}

    // Seed counties and store their IDs
    for (const countyData of countiesSeedData) {
      const county = await this.prisma.county.create({
        data: countyData,
      })
      counties[countyData.slug] = county.id
    }

    // Seed municipalities and store their IDs
    for (const municipalityData of municipalitiesSeedData) {
      const countyId = counties[municipalityData.countySlug]
      const municipality = await this.prisma.municipality.create({
        data: {
          name: municipalityData.name,
          slug: municipalityData.slug,
          state: municipalityData.state,
          type: municipalityData.type,
          data: municipalityData.data,
          county: {
            connect: { id: countyId },
          },
        },
      })
      municipalities[municipalityData.slug] = municipality.id
    }

    // Seed races and associate with counties and municipalities
    for (const raceData of racesSeedData) {
      const countyId = counties[raceData.countySlug]
      const municipalityId = municipalities[raceData.municipalitySlug]

      await this.prisma.race.create({
        data: {
          ballotId: raceData.ballotId,
          ballotHashId: raceData.ballotHashId,
          hashId: raceData.hashId,
          positionSlug: raceData.positionSlug,
          state: raceData.state,
          electionDate: new Date(raceData.electionDate),
          level: raceData.level,
          subAreaName: raceData.subAreaName,
          subAreaValue: raceData.subAreaValue,
          data: raceData.data,
          county: countyId ? { connect: { id: countyId } } : undefined,
          municipality: municipalityId
            ? { connect: { id: municipalityId } }
            : undefined,
        },
      })
    }
    return 'race data is seeded'
  }

  // private async getOtherRaces(race: {
  //   municipality?: { id: string }
  //   county?: { id: string }
  // }) {
  //   let otherRaces: Race[] = []

  //   if (race.municipality) {
  //     otherRaces = await this.prisma.race.findMany({
  //       where: { municipalityId: race.municipality.id },
  //       select: { data: true, hashId: true, positionSlug: true },
  //     })
  //   } else if (race.county) {
  //     otherRaces = await this.prisma.race.findMany({
  //       where: { countyId: race.county.id },
  //       select: { data: true, hashId: true, positionSlug: true },
  //     })
  //   }

  //   const dedups = {}
  //   return otherRaces
  //     .map((otherRace) => {
  //       if (!dedups[otherRace.positionSlug]) {
  //         dedups[otherRace.positionSlug] = true
  //         return {
  //           name: otherRace.data.normalized_position_name,
  //           slug: otherRace.positionSlug,
  //         }
  //       }
  //     })
  //     .filter(Boolean)
  // }

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
    } = race.data as RaceData

    const filtered = {
      hashId: race.hashId,
      positionName: position_name,
      // locationName: name,
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
