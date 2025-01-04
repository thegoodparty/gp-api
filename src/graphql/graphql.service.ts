import { Injectable } from '@nestjs/common'
import { GraphQLClient, gql } from 'graphql-request'
import { Logger } from '@nestjs/common'

// note: if we ever need to support multiple api bases
// we can cross that bridge when we get to it
const API_BASE = 'https://bpi.civicengine.com/graphql'
const BALLOT_READY_KEY = process.env.BALLOT_READY_KEY

@Injectable()
export class GraphqlService {
  private readonly logger = new Logger(GraphqlService.name)
  constructor(private readonly graphQLClient: GraphQLClient) {
    graphQLClient = new GraphQLClient(API_BASE, {
      headers: {
        authorization: `Bearer ${BALLOT_READY_KEY}`,
        'Content-Type': 'application/json',
      },
    })
  }

  async fetchGraphql(query: any, variables?: any) {
    let data: any

    try {
      const gqlQuery = gql`
        ${query}
      `
      data = await this.graphQLClient.request(gqlQuery, variables || {})
    } catch (e) {
      this.logger.error('error at fetchGraphql', e)
      throw e
    }
    return data
  }
}
