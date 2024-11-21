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

// TODO: need a schema enum for these?
const LEVELS = ['LOCAL', 'CITY', 'COUNTY', 'STATE', 'FEDERAL']
const P2V_STATUS = ['Waiting', 'Complete', 'Failed']

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
    data: {},
    details: {
      state: faker.helpers.arrayElement(STATE_CODES),
      ballotLevel: faker.helpers.arrayElement(LEVELS),
      electionDate: electionDate.toISOString().split('T')[0],
      primaryElectionDate: faker.date
        .past({ refDate: electionDate })
        .toISOString()
        .split('T')[0],
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
    p2vStatus: faker.helpers.arrayElement(P2V_STATUS),
    // copy/pasted values below
    men: '6988',
    asian: 0,
    white: 0,
    women: '7917',
    indies: '5030',
    hispanic: 0,
    voteGoal: 2705,
    voterMap:
      'https://www.google.com/maps/d/u/0/embed?mid=1d2eV6vp2ALJpVvFu_l_stWSr4Re6H8g&ehbc=2E312F',
    budgetLow: 0,
    democrats: '7113',
    winNumber: 2604,
    budgetHigh: 0,
    finalVotes: '2894',
    p2vComplete: '2024-02-26',
    republicans: '2677',
    allAvailVoters: '7432',
    averageTurnout: 0,
    africanAmerican: 0,
    availVotersTo35: '1656',
    voterProjection: 1131,
    projectedTurnout: 5105,
    voterContactGoal: 12076,
    totalRegisteredVoters: 14820,
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
