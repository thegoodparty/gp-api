import { Module } from '@nestjs/common'
import { RacesService } from './services/races.service'
import { RacesController } from './races.controller'
import { MunicipalitiesService } from './services/municipalities.services'
import { CountiesService } from './services/counties.services'
import { CensusEntitiesService } from './services/censusEntities.services'
import { BallotDataService } from './services/ballotData.service'
import { BallotDataController } from './ballotData.controller'
import { BallotReadyService } from './services/ballotReady.service'
import { AiModule } from '../ai/ai.module'

@Module({
  controllers: [RacesController, BallotDataController],
  providers: [
    RacesService,
    MunicipalitiesService,
    CountiesService,
    CensusEntitiesService,
    BallotDataService,
    BallotReadyService,
  ],
  exports: [RacesService, BallotDataService],
  imports: [AiModule],
})
export class RacesModule {}
