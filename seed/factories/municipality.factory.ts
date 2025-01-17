import { Municipality } from '@prisma/client'
import { faker } from '@faker-js/faker'
import slugify from 'slugify'
import { generateFactory } from './generate'
import {
  getRandomInt,
  getRandomPercentage,
  getRandomElementFromArray,
} from 'src/shared/util/numbers.util'

const cities = [
  'Glendale',
  'Santa Clarita',
  'Torrance',
  'Palmdale',
  'Burbank',
  'West Covina',
  'Pasadena',
  'Inglewood',
  'Compton',
  'Carson',
  'Santa Monica',
  'Hawthorne',
  'Lakewood',
  'Bellflower',
  'Lynwood',
  'Redondo Beach',
  'Pico Rivera',
  'Montebello',
]

export const municipalityFactory = generateFactory<Municipality>(() => {
  const city = getRandomElementFromArray(cities)
  return {
    id: faker.number.int({ max: 2147483647 }),
    slug: `ca/los-angeles/${slugify(city, { lower: true })}`,
    name: city,
    state: 'CA',
    type: 'city',
    data: {
      city,
      county_full: `${city} County`,
      county_name: 'Los Angeles',
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
