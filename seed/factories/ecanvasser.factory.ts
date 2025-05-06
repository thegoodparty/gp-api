import { Ecanvasser } from '@prisma/client'
import { generateFactory } from './generate'
import { faker } from '@faker-js/faker'

export const ecanvasserFactory = generateFactory<Ecanvasser>(() => {
  return {
    campaignId: faker.number.int(),
    apiKey: faker.string.alphanumeric(),
  }
})
