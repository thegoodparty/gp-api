import { Injectable } from '@nestjs/common'
import { GraphQLClient, gql } from 'graphql-request'
import { Logger } from '@nestjs/common'

@Injectable()
export class GraphqlService {
  private readonly logger = new Logger(GraphqlService.name)
  constructor(private readonly graphQLClient: GraphQLClient) {}

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
