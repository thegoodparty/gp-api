import { Injectable } from '@nestjs/common'
import { CreateRaceDto } from './dto/create-race.dto'
import { UpdateRaceDto } from './dto/update-race.dto'
import { PrismaService } from 'src/prisma/prisma.service'
import {
  countiesSeedData,
  CountyDataType,
  municipalitiesSeedData,
  MunicipalityDataType,
  racesSeedData,
} from './races.seed'

@Injectable()
export class RacesService {
  constructor(private prisma: PrismaService) {}
  create(createRaceDto: CreateRaceDto) {
    return 'This action adds a new race'
  }

  findAll() {
    return `This action returns all races`
  }

  findOne(id: number) {
    return `This action returns a #${id} race`
  }

  update(id: number, updateRaceDto: UpdateRaceDto) {
    return `This action updates a #${id} race`
  }

  remove(id: number) {
    return `This action removes a #${id} race`
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
}
