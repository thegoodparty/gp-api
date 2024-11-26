import { County } from '@prisma/client'
import { faker } from '@faker-js/faker'
import { generateFactory } from '../generate'
import slugify from 'slugify'

const counties = [
  'Los Angeles',
  'San Diego',
  'Orange',
  'Riverside',
  'San Bernardino',
  'Santa Clara',
  'Alameda',
  'Sacramento',
]

export const countyFactory = generateFactory<County>(() => {
  const county = getRandomCounty()
  return {
    id: faker.string.uuid(),
    slug: `ca/${slugify(county, { lower: true })}`,
    name: county,
    state: 'CA',
    createdAt: new Date(),
    updatedAt: faker.date.anytime(),
    data: {
      county,
      county_full: `${county} County`,
      state_id: 'CA',
      state_name: 'California',
      city_largest: 'Los Angeles',
      lat: faker.location.latitude({ min: 34.0, max: 34.5 }), // Latitude range for Los Angeles County
      lng: faker.location.longitude({ min: -118.5, max: -118.0 }), // Longitude range for Los Angeles County
      population: randomNumber(9_000_000, 10_500_000).toString(), // Approximate LA County population
      density: randomNumber(900, 1000).toString(),
      income_individual_median: randomNumber(30_000, 40_000).toString(),
      home_value: randomNumber(500_000, 900_000).toString(),
      unemployment_rate: randomPercentage().toFixed(1),
    },
  }

  function getRandomCounty() {
    return faker.helpers.arrayElement(counties)
  }
  function randomPercentage() {
    return faker.number.float({ min: 0, max: 100, fractionDigits: 1 })
  }
  function randomNumber(min: number, max: number) {
    return faker.number.int({ min, max })
  }
})
