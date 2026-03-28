import { ElectedOffice } from '@prisma/client'
import { faker } from '@faker-js/faker'
import { randomUUID } from 'crypto'
import { generateFactory } from './generate'

export const electedOfficeFactory = generateFactory<ElectedOffice>(() => {
  const id = randomUUID()
  return {
    id,
    organizationSlug: `org-${faker.string.nanoid(8)}`,
    swornInDate: faker.date.past(),
    userId: faker.number.int({ min: 1, max: 1000 }),
    campaignId: faker.number.int({ min: 1, max: 1000 }),
  }
})
