import { Module } from '@nestjs/common'
import { GraphqlService } from './graphql.service'
import { GraphQLClient } from 'graphql-request'

@Module({
  controllers: [],
  providers: [GraphqlService],
  imports: [GraphQLClient],
})
export class GraphqlModule {}
