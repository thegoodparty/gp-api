import { Ecanvasser } from '../../src/generated/prisma'
import { generateFactory } from './generate'
import { faker } from '@faker-js/faker'

export const ecanvasserFactory = generateFactory<Ecanvasser>(() => {
  return {
    campaignId: faker.number.int(),
    apiKey: faker.string.alphanumeric(),
  }
})
