import { PathToVictory } from '@prisma/client'
import { faker } from '@faker-js/faker'
import { generateFactory } from './generate'
import { P2VStatus } from 'src/races/types/pathToVictory.types'

export const pathToVictoryFactory = generateFactory<PathToVictory>(() => ({
  id: faker.number.int({ max: 2147483647 }),
  createdAt: new Date(),
  updatedAt: faker.date.anytime(),
  campaignId: faker.number.int(),
  data: {
    p2vStatus: faker.helpers.enumValue(P2VStatus),
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
