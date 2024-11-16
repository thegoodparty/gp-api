import { Injectable } from '@nestjs/common'
import { CreateRaceDto } from './dto/create-race.dto'
import { UpdateRaceDto } from './dto/update-race.dto'
import { PrismaService } from 'src/prisma/prisma.service'
import { countiesSeedData, CountyDataType, municipalitiesSeedData, MunicipalityDataType } from './races.seed'



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

    const countiesSeedData: CountyDataType[] = [
      // Add your county seed data here
    ]

    const municipalitiesSeedData: MunicipalityDataType[] = [
      // Add your municipality seed data here
    ]

    // Seed counties and store their IDs
    for (const countyData of countiesSeedData) {
      const county = await this.prisma.county.create({
        data: countyData,
      })
      counties[countyData.slug] = county.id
    }

    // Seed municipalities and associate with counties
    for (const municipalityData of municipalitiesSeedData) {
      const countyId = counties[municipalityData.countySlug]
      delete municipalityData.countySlug
      await this.prisma.municipality.create({
        data: {
          name: municipalityData.name,
          slug: municipalityData.slug,
          type: municipalityData.type,
          state: municipalityData.state,
          county: {
            connect: { id: countyId },
          },
        },
      })
    }
  }
}
