import { faker } from '@faker-js/faker'
import {
  CampaignUpdateHistory,
  CampaignUpdateHistoryType,
} from '@prisma/client'
import { generateFactory } from './generate'

export const campaignUpdateHistoryFactory =
  generateFactory<CampaignUpdateHistory>(() => ({
    id: faker.number.int({ max: 2147483647 }),
    createdAt: new Date(),
    updatedAt: faker.date.anytime(),
    campaignId: faker.number.int(),
    type: faker.helpers.arrayElement(Object.values(CampaignUpdateHistoryType)),
    quantity: faker.number.int({ min: 100, max: 10000 }),
    userId: faker.number.int({ max: 2147483647 }),
  }))
