import { Injectable, InternalServerErrorException } from '@nestjs/common'
import { GraphQLClient, gql } from 'graphql-request'
import { Logger } from '@nestjs/common'

const API_BASE = 'https://bpi.civicengine.com/graphql'
const BALLOT_READY_KEY = process.env.BALLOT_READY_KEY
if (!BALLOT_READY_KEY) {
  throw new InternalServerErrorException(
    'Please set BALLOT_READY_KEY in your .env',
  )
}

@Injectable()
export class GraphqlService {
  private readonly logger = new Logger(GraphqlService.name)
  private readonly graphQLClient = new GraphQLClient(API_BASE, {
    headers: {
      authorization: `Bearer ${BALLOT_READY_KEY}`,
      'Content-Type': 'application/json',
    },
  })
  // TODO: Type the params and return value
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
