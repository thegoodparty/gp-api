import { truncateZip } from 'src/shared/util/zipcodes.util'

export function getRaceQuery(zip: string, startCursor) {
  const today = new Date().toISOString().split('T')[0]
  const nextYear = new Date()
  nextYear.setFullYear(nextYear.getFullYear() + 4)
  const nextYearFormatted = nextYear.toISOString().split('T')[0]

  const query = `
  query {
    races(
      location: {
        zip: "${truncateZip(zip)}"
      }
      filterBy: {
        electionDay: {
          gt: "${today}"
          lt: "${nextYearFormatted}"
        }
      }
      after: ${startCursor ? `"${startCursor}"` : null}
    ) {
      edges {
        node {
          id
          isPrimary
          election {
            id
            electionDay
            name
            originalElectionDate
            state
            timezone
          }
          position {
            id
            appointed
            hasPrimary
            partisanType
            level
            name
            salary
            state
            subAreaName
            subAreaValue
            electionFrequencies {
              frequency
            }
          }
          filingPeriods {
            startOn
            endOn
          }
        }
      }
      pageInfo {
        endCursor
        hasNextPage
        hasPreviousPage
        startCursor
      }
    }
  }
  `
  return query
}
