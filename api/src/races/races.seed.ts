import { PrismaClient } from '@prisma/client'
import { countyFactory } from './factories/county.factory'
import { municipalityFactory } from './factories/municipality.factory'
import { raceFactory } from './factories/race.factory'

const NUM_COUNTIES = 2
const NUM_MUNICIPALITIES_PER_COUNTY = 2
const NUM_RACES = 2

export default async function seedRaces(prisma: PrismaClient) {
  const fakeCounties: any[] = []
  const fakeMunicipalities: any[] = []
  const fakeRaces: any[] = []

  for (let i = 0; i < NUM_COUNTIES; i++) {
    // TODO: move user seeding to its own file
    const county = countyFactory()

    for (let j = 0; j < NUM_MUNICIPALITIES_PER_COUNTY; j++) {
      const municipality = municipalityFactory()
      municipality.countyId = county.id
      fakeMunicipalities.push(municipality)

      for (let k = 0; k < NUM_RACES; k++) {
        const race = raceFactory()
        race.municipalityId = municipality.id
        fakeRaces.push(race)
      }
    }
    fakeCounties.push(county)
  }

  console.log('fakeCounties', fakeCounties)
  console.log('fakeMunicipalities', fakeMunicipalities)
  console.log('fakeRaces', fakeRaces)

  await prisma.county.createMany({ data: fakeCounties })
  await prisma.municipality.createMany({ data: fakeMunicipalities })
  const { count } = await prisma.race.createMany({ data: fakeRaces })

  console.log(`Created ${count} races`)
}
