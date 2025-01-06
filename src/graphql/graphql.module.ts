import { Module } from '@nestjs/common'
import { GraphqlService } from './graphql.service'
import { GraphQLClient } from 'graphql-request'

@Module({
  controllers: [],
  providers: [GraphqlService, GraphQLClient],
  imports: [],
  exports: [GraphqlService],
})
export class GraphqlModule {}
