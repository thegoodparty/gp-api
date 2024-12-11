import { TopIssue, Position, CampaignPosition } from '@prisma/client'
import { faker } from '@faker-js/faker'
import { generateFactory } from './generate'

const uniquePositionNames = faker.helpers.uniqueArray(() => faker.lorem.slug(), 20);

export const positionFactory = generateFactory<Position>((args?: unknown) => {
  const overrides = (args as Partial<Position>) || {};
  
  return {
    id: faker.number.int({ max: 2147483647 }),
    name: uniquePositionNames.pop() || `fallback-${faker.string.uuid()}`,
    topIssueId: overrides.topIssueId || null,
    ...overrides, 
  }
})