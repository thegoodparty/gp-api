import { County } from '@prisma/client'
import { faker } from '@faker-js/faker'
import slugify from 'slugify'
import { generateFactory } from '../../../seed/factories/generate'
import {
  getRandomElementFromArray,
  getRandomInt,
  getRandomPercentage,
} from '../../../src/shared/util/numbers.util'

const counties = [
  'San Diego',
  'Orange',
  'Riverside',
  'San Bernardino',
  'Santa Clara',
  'Alameda',
  'Sacramento',
  'Contra Costa',
  'Fresno',
  'Kern',
  'San Francisco',
  'Ventura',
  'San Mateo',
  'San Joaquin',
]

export const countyFactory = generateFactory<County>(() => {
  const county = getRandomElementFromArray(counties)
  return {
    id: faker.number.int({ max: 2147483647 }),
    slug: `ca/${slugify(county, { lower: true })}`,
    name: county,
    state: 'CA',
    data: {
      county,
      county_full: `${county} County`,
      state_id: 'CA',
      state_name: 'California',
      city_largest: 'Los Angeles',
      lat: faker.location.latitude({ min: 34.0, max: 34.5 }), // Latitude range for Los Angeles County
      lng: faker.location.longitude({ min: -118.5, max: -118.0 }), // Longitude range for Los Angeles County
      population: getRandomInt(9_000_000, 10_500_000).toString(), // Approximate LA County population
      density: getRandomInt(900, 1000).toString(),
      income_individual_median: getRandomInt(30_000, 40_000).toString(),
      home_value: getRandomInt(500_000, 900_000).toString(),
      unemployment_rate: getRandomPercentage().toFixed(1),
      poverty_rate: getRandomPercentage().toFixed(1),
      education_high_school: getRandomPercentage().toFixed(1),
      education_college: getRandomPercentage().toFixed(1),
      education_graduate: getRandomPercentage().toFixed(1),
    },
  }
})
