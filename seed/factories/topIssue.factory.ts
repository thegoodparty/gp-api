import { faker } from '@faker-js/faker'
import { TopIssue } from '@prisma/client'
import { generateFactory } from './generate'

const uniqueTopIssueNames = faker.helpers.uniqueArray(
  () => faker.lorem.slug(),
  20,
)

export const topIssueFactory = generateFactory<TopIssue>((overrides = {}) => {
  return {
    name: uniqueTopIssueNames.pop() || `fallback-${faker.string.uuid()}`,
  }
})
