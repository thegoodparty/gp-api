import { PrismaClient } from '@prisma/client'
import { countyFactory } from './factories/county.factory'
import { municipalityFactory } from './factories/municipality.factory'
import { raceFactory } from './factories/race.factory'

const NUM_COUNTIES = 10
const NUM_MUNICIPALITIES_PER_COUNTY = 2
const NUM_RACES = 10

export default async function seedRaces(prisma: PrismaClient) {
  const fakeCounties: any[] = []
  const fakeMunicipalities: any[] = []
  const fakeRaces: any[] = []

  for (let i = 0; i < NUM_COUNTIES; i++) {
    const county = countyFactory()
    if (i === 0) {
      // for testing
      county.name = 'Los Angeles'
      county.slug = 'ca/los-angeles'
    }

    for (let j = 0; j < NUM_MUNICIPALITIES_PER_COUNTY; j++) {
      const municipality = municipalityFactory({
        countyId: county.id,
      })
      if (i === 0 && j === 0) {
        // for testing
        municipality.name = 'Los Angeles'
        municipality.slug = 'ca/los-angeles/los-angeles'
      }
      fakeMunicipalities.push(municipality)

      for (let k = 0; k < NUM_RACES; k++) {
        const race = raceFactory({
          municipalityId: municipality.id,
          countyId: county.id,
          // TODO: We shouldn't have to do this. Quit duplicating data that's already
          //  on the record.
          ...(k === NUM_RACES - 1
            ? {
                level: 'county',
                positionSlug: 'county-supervisor',
                data: { level: 'county', position_name: 'County Supervisor' },
              }
            : {}),
        })

        fakeRaces.push(race)
      }
    }
    fakeCounties.push(county)
  }

  await prisma.county.createMany({ data: fakeCounties })
  await prisma.municipality.createMany({ data: fakeMunicipalities })
  const { count } = await prisma.race.createMany({ data: fakeRaces })

  console.log(`Created ${count} races`)
}
