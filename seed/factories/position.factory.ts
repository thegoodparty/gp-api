import { Position } from '@prisma/client'
import { faker } from '@faker-js/faker'
import { generateFactory } from './generate'

const uniquePositionNames = faker.helpers.uniqueArray(
  () => faker.lorem.slug(),
  20,
)

export const positionFactory = generateFactory<Position>((args?: unknown) => {
  const overrides = (args as Partial<Position>) || {}

  return {
    name: uniquePositionNames.pop() || `fallback-${faker.string.uuid()}`,
    topIssueId: overrides.topIssueId || null,
    ...overrides,
  }
})
