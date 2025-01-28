import { Module } from '@nestjs/common'
import { RacesService } from './races.service'
import { RacesController } from './races.controller'
import { GraphqlModule } from 'src/graphql/graphql.module'

@Module({
  controllers: [RacesController],
  providers: [RacesService],
  imports: [GraphqlModule],
  exports: [RacesService],
})
export class RacesModule {}
