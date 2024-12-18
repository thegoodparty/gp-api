import { Logger } from '@nestjs/common'
import { queryHelper } from '../../shared/util/graphql.util'

export async function getElectionDates(
  slug: string,
  officeName: string,
  zip: string,
  level: string,
) {
  const electionDates: string[] = []
  const logger = new Logger('extractLocationAi')
  try {
    // get todays date in format YYYY-MM-DD
    const today = new Date()
    const year = today.getFullYear()
    const month = (today.getMonth() + 1).toString().padStart(2, '0')
    const day = today.getDate().toString().padStart(2, '0')
    const dateToday = `${year}-${month}-${day}`

    const query = `
          query {
              races(
                  location: { zip: "${zip}" }
                  filterBy: { electionDay: { gt: "2006-01-01", lt: "${dateToday}" }, level: ${level} }
              ) {
                  edges {
                      node {
                          position {    
                              name
                          }
                          election {
                              electionDay
                          }
                      }
                  }
              }
          }`

    const { races } = await queryHelper(query)
    logger.log(slug, 'getElectionDates graphql result', races)
    const results = races?.edges || []
    for (let i = 0; i < results.length; i++) {
      const result = results[i]
      const { position, election } = result.node
      if (position?.name && election?.electionDay) {
        if (position.name.toLowerCase() === officeName.toLowerCase()) {
          if (!electionDates.includes(election.electionDay)) {
            electionDates.push(election.electionDay)
          }
        }
      }
    }
    logger.log(slug, 'electionDates', electionDates)

    return electionDates
  } catch (e) {
    logger.error(slug, 'error at extract-location-ai helper', e)
    return []
  }
}
