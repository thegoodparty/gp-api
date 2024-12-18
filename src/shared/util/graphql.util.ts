import { Logger } from '@nestjs/common'
import { GraphQLClient, gql } from 'graphql-request'

const ballotReadyKey = process.env.BALLOT_READY_KEY || ''

export async function queryHelper(query: any, variables?: any) {
  const logger = new Logger('queryHelper')
  try {
    const endpoint = 'https://bpi.civicengine.com/graphql'

    const graphQLClient = new GraphQLClient(endpoint, {
      headers: {
        authorization: `Bearer ${ballotReadyKey}`,
        'Content-Type': 'application/json',
      },
    })

    const gqlQuery = gql`
      ${query}
    `

    const data: any = await graphQLClient.request(gqlQuery, variables || {})
    return data
  } catch (e) {
    logger.error('error at queryHelper', e)
    throw e
  }
}
