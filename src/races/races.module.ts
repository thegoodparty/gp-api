import { Module } from '@nestjs/common'
import { RacesService } from './services/races.service'
import { RacesController } from './races.controller'
import { GraphqlModule } from 'src/graphql/graphql.module'
import { MunicipalitiesService } from './services/municipalities.services'
import { CountiesService } from './services/counties.services'
import { CensusEntitiesService } from './services/censusEntities.services'
import { BallotDataService } from './services/ballotData.service'
import { BallotDataController } from './ballotData.controller'

@Module({
  controllers: [RacesController, BallotDataController],
  providers: [
    RacesService,
    MunicipalitiesService,
    CountiesService,
    CensusEntitiesService,
    BallotDataService,
  ],
  imports: [GraphqlModule],
  exports: [RacesService, BallotDataService],
})
export class RacesModule {}
