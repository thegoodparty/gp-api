import { faker } from '@faker-js/faker'
import { Position } from '@prisma/client'
import { generateFactory } from './generate'

const uniquePositionNames = faker.helpers.uniqueArray(
  () => faker.lorem.slug(),
  20,
)

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
export const positionFactory = generateFactory<Position>((args?: unknown) => {
  const overrides = (args as Partial<Position>) || {}

  return {
    name: uniquePositionNames.pop() || `fallback-${faker.string.uuid()}`,
    topIssueId: overrides.topIssueId || null,
    ...overrides,
  }
})
