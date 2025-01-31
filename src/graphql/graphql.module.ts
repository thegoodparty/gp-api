import { InternalServerErrorException, Module } from '@nestjs/common'
import { GraphqlService } from './graphql.service'
import { GraphQLClient } from 'graphql-request'

// note: if we ever need to support multiple api bases
// we can cross that bridge when we get to it
const API_BASE = 'https://bpi.civicengine.com/graphql'
const BALLOT_READY_KEY = process.env.BALLOT_READY_KEY
if (!BALLOT_READY_KEY) {
  throw new InternalServerErrorException(
    'Please set BALLOT_READY_KEY in your .env',
  )
}

@Module({
  controllers: [],
  providers: [
    GraphqlService,
    {
      provide: GraphQLClient,
      useValue: new GraphQLClient(API_BASE, {
        headers: {
          authorization: `Bearer ${BALLOT_READY_KEY}`,
          'Content-Type': 'application/json',
        },
      }),
    },
  ],
  exports: [GraphqlService],
})
export class GraphqlModule {}
