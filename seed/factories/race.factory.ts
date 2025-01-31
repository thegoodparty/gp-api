import { faker } from '@faker-js/faker'
import { generateFactory } from './generate'
import { Race } from 'src/races/types/races.types'

export const raceFactory = generateFactory<Race>(() => {
  const subAreaName = 'District'
  const subAreaValue = faker.number.int({ min: 1, max: 15 }).toString() // Random district value
  const ballotId = faker.number.int({ max: 9999999 }).toString()
  const ballotHashId = faker.string.alphanumeric(10) // Random fake hash ID
  const hashId = faker.string.alphanumeric(6) // Random fake hash ID
  const positionSlug = 'city-legislature'
  const level = 'city'
  const state = 'CA'
  const electionDate = new Date('2025-11-04') // Fixed example election date
  const electionDay = new Date('2025-11-04') // Example election day for data
  const filingDateStart = faker.date.anytime().toString()
  const filingDateEnd = faker.date.anytime().toString()
  return {
    id: faker.number.int({ max: 2147483647 }),
    ballotId,
    ballotHashId,
    hashId,
    positionSlug,
    state,
    electionDate,
    level,
    subAreaName,
    subAreaValue,
    data: {
      position_name: `Los Angeles City Council - ${subAreaName} ${subAreaValue}`,
      state,
      race_id: parseInt(ballotId, 10), // Convert ballotId to a number for race_id
      is_primary: faker.datatype.boolean(),
      is_judicial: faker.datatype.boolean(),
      sub_area_name: subAreaName,
      sub_area_value: subAreaValue,
      filing_periods: [
        {
          start_on: filingDateStart,
          end_on: filingDateEnd,
        },
      ],
      frequency: [],
      election_day: electionDay.toISOString(),
      normalized_position_name: 'City Legislature',
      level,
      filing_date_start: filingDateStart,
      filing_date_end: filingDateEnd,
    },
  }
})
