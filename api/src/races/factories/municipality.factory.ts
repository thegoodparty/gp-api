import { Municipality } from '@prisma/client'
import { faker } from '@faker-js/faker'
import slugify from 'slugify'
import { generateFactory } from '../../../seed/factories/generate'

const cities = [
  'Los Angeles',
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
  const city = getRandomCity()
  return {
    id: faker.string.uuid(),
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
      population: randomNumber(9_000_000, 10_500_000).toString(), // Approximate LA County population
      density: randomNumber(900, 1000).toString(),
      income_individual_median: randomNumber(30_000, 40_000).toString(),
      home_value: randomNumber(500_000, 900_000).toString(),
      unemployment_rate: randomPercentage().toFixed(1),
    },
  }

  function getRandomCity() {
    return faker.helpers.arrayElement(cities)
  }
  function randomPercentage() {
    return faker.number.float({ min: 0, max: 100, fractionDigits: 2 })
  }
  function randomNumber(min: number, max: number) {
    return faker.number.int({ min, max })
  }
})
