import { PathToVictory } from '@prisma/client'
import { faker } from '@faker-js/faker'
import { generateFactory } from './generate'
import { P2VStatus } from 'src/elections/types/pathToVictory.types'

// some copy/pasted values from the DB
const ELECTION_TYPES = [
  'Unified_School_SubDistrict',
  'Community_College_SubDistrict',
  'Judicial_Appellate_District',
  'School_Board_District',
  'Judicial_District',
  'Judicial_Superior_Court_District',
  'Borough',
  'State_House_District',
  'State_Senate_District',
  'County_Commissioner_District',
  'City_Ward',
  'Precinct',
  'Township_Ward',
  'Election_Commissioner_District',
  'Town_District',
  'Hamlet_Community_Area',
  'Proposed_City_Commissioner_District',
  'High_School_District',
  'Unified_School_District',
  'County_Supervisorial_District',
]
const ELECTION_LOCATIONS = [
  'SC##COLUMBIA CITY##',
  'NV##017',
  'MN##LYON',
  'VT##WASHINGTON-1',
  'TN##TULLAHOMA CITY##',
  'NC##APEX TOWN',
  'IL##MOLINE CITY',
  'FL##GULFPORT CITY (EST.)##',
  'OR##WASCO',
  'IL##WILMETTE SD 39',
  'PA##BRADFORD CITY##',
]

export const pathToVictoryFactory = generateFactory<PathToVictory>(() => ({
  id: faker.number.int({ max: 2147483647 }),
  createdAt: new Date(),
  updatedAt: faker.date.anytime(),
  campaignId: faker.number.int(),
  data: {
    p2vStatus: faker.helpers.enumValue(P2VStatus),
    electionType: faker.helpers.maybe(
      () => faker.helpers.arrayElement(ELECTION_TYPES),
      { probability: 0.2 }, // to have some P2Vs without electionType set
    ),
    electionLocation: faker.helpers.maybe(
      () => faker.helpers.arrayElement(ELECTION_LOCATIONS),
      { probability: 0.2 }, // to have some P2Vs without electionLocation set
    ),
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
