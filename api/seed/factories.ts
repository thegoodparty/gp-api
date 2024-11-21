import {
  Campaign,
  CampaignTier,
  CampaignUpdateHistory,
  CampaignUpdateHistoryType,
  PathToVictory,
  User,
} from '@prisma/client'
import { faker } from '@faker-js/faker'
import { deepMerge } from '../src/shared/helpers/objectHelper'
import { STATE_CODES } from '../src/shared/constants/states'

// TODO: need a schema enum for this?
const LEVELS = ['LOCAL', 'CITY', 'COUNTY', 'STATE', 'FEDERAL']

export const userFactory = generateFactory<User>(() => ({
  id: faker.number.int({ max: 2147483647 }),
  createdAt: new Date(),
  updatedAt: faker.date.anytime(),
  firstName: faker.person.firstName(),
  lastName: faker.person.lastName(),
  email: faker.internet.email(),
  phone: faker.phone.number(),
  metaData: {},
}))

export const campaignFactory = generateFactory<Campaign>(() => {
  const electionDate = faker.date.past()
  return {
    id: faker.number.int({ max: 2147483647 }),
    createdAt: new Date(),
    updatedAt: faker.date.anytime(),
    slug: faker.lorem.words(5),
    isActive: faker.datatype.boolean(0.5),
    isVerified: faker.datatype.boolean(0.5),
    isPro: faker.datatype.boolean(0.5),
    isDemo: faker.datatype.boolean(0.1),
    didWin: undefined,
    dateVerified: undefined,
    tier: faker.helpers.arrayElement(Object.values(CampaignTier)),
    data: {
      electionDate: electionDate.toISOString().split('T')[0],
      primaryElectionDate: faker.date
        .past({ refDate: electionDate })
        .toISOString()
        .split('T')[0],
      p2vStatus: 'Waiting',
    },
    details: {
      state: faker.helpers.arrayElement(STATE_CODES),
      ballotLevel: faker.helpers.arrayElement(LEVELS),
    },
    aiContent: {},
    vendorTsData: {},
  }
})

export const pathToVictoryFactory = generateFactory<PathToVictory>(() => ({
  id: faker.number.int({ max: 2147483647 }),
  createdAt: new Date(),
  updatedAt: faker.date.anytime(),
  campaignId: faker.number.int(),
  data: {
    foo: 'dc2f6c7c-ad6a-408b-9b6e-e273280b572d',
    bar: 8466451537068032,
    bike: 'd',
    a: 'T',
    b: 0.3825467659626156,
    name: 'Jewel',
    prop: '0b1',
  },
}))

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

/**
 * Helper to make a factory function that merges a default generator with a custom props object
 * @param generateFn Function to generate a default mock entity
 * @returns Factory function that accepts args to override default generated values
 * @example
 * const userFactory = generateFactory<User>(() => ({
 *   id: faker.number.int(),
 *   firstName: faker.person.firstName(),
 *   lastName: faker.person.lastName()
 * }))
 *
 * const fakeUser = userFactory({ firstName: 'Jerry'})
 */
function generateFactory<T>(generateFn: (args?: unknown) => Partial<T>) {
  return (args: Partial<T> = {}) => deepMerge(generateFn(), args) as T
}
