import { TopIssue, Position, CampaignPosition } from '@prisma/client'
import { faker } from '@faker-js/faker'
import { generateFactory } from './generate'

const uniqueTopIssueNames = faker.helpers.uniqueArray(() => faker.lorem.slug(), 20);

export const topIssueFactory = generateFactory<TopIssue>((overrides = {}) => {
  return {
    id: faker.number.int({ max: 2147483647 }),
    name: uniqueTopIssueNames.pop() || `fallback-${faker.string.uuid()}`,
    icon: faker.helpers.maybe(() => faker.image.url(), { probability: 0.5 }) || null,
  }
})
