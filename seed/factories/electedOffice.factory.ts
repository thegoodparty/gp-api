import { ElectedOffice } from '@prisma/client'
import { faker } from '@faker-js/faker'
import { generateFactory } from './generate'

export const electedOfficeFactory = generateFactory<ElectedOffice>(() => {
  return {
    electedDate: faker.date.past(),
    swornInDate: faker.date.past(),
    termStartDate: null,
    termEndDate: null,
    termLengthDays: null,
    isActive: true,
    userId: faker.number.int({ min: 1, max: 1000 }),
    campaignId: faker.number.int({ min: 1, max: 1000 }),
  }
})
