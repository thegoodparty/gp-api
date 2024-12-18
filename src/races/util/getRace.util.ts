import { queryHelper } from '../../shared/util/graphql.util'

export async function getRaceById(raceId: string) {
  const query = `
        query Node {
          node(id: "${raceId}") {
              ... on Race {
                  databaseId
                  isPartisan
                  isPrimary
                  election {
                      electionDay
                      name
                      state
                  }
                  position {
                      id
                      description
                      judicial
                      level
                      name
                      partisanType
                      staggeredTerm
                      state
                      subAreaName
                      subAreaValue
                      tier
                      mtfcc
                      geoId
                      electionFrequencies {
                          frequency
                      }
                      hasPrimary
                      normalizedPosition {
                        name
                    }
                  }
                  filingPeriods {
                      endOn
                      startOn
                  }
              }
          }
      }
      `
  const { node } = await queryHelper(query)
  return node
}
