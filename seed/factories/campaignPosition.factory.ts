import { CampaignPosition } from '@prisma/client'
import { faker } from '@faker-js/faker'
import { generateFactory } from './generate'

export const campaignPositionFactory = generateFactory<CampaignPosition>(
  (args?: unknown) => {
    const overrides = (args as Partial<CampaignPosition>) || {}
    return {
      id: faker.number.int({ max: 2147483647 }),
      description: faker.helpers.maybe(() => faker.lorem.sentence(), {
        probability: 0.7,
      }),
      order: faker.helpers.maybe(() => faker.number.int({ min: 1, max: 100 }), {
        probability: 0.5,
      }),
      topIssueId: overrides.topIssueId || null,
      ...overrides,
    }
  },
)
