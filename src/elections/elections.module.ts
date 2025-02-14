import { Module } from '@nestjs/common'
import { RacesService } from './services/races.service'
import { MunicipalitiesService } from './services/municipalities.service'
import { CountiesService } from './services/counties.service'
import { CensusEntitiesService } from './services/censusEntities.service'
import { BallotReadyService } from './services/ballotReady.service'
import { ElectionsController } from './elections.controller'
import { AiModule } from '../ai/ai.module'

@Module({
  controllers: [ElectionsController],
  providers: [
    RacesService,
    MunicipalitiesService,
    CountiesService,
    CensusEntitiesService,
    BallotReadyService,
  ],
  exports: [RacesService],
  imports: [AiModule],
})
export class ElectionsModule {}
