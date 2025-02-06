import { Module } from '@nestjs/common'
import { RacesService } from './services/races.service'
import { RacesController } from './races.controller'
import { GraphqlModule } from 'src/graphql/graphql.module'
import { MunicipalitiesService } from './services/municipalities.services'
import { CountiesService } from './services/counties.services'
import { CensusEntitiesService } from './services/censusEntities.services'
import { AiModule } from '../ai/ai.module'

@Module({
  controllers: [RacesController],
  providers: [
    RacesService,
    MunicipalitiesService,
    CountiesService,
    CensusEntitiesService,
  ],
  imports: [GraphqlModule, AiModule],
  exports: [RacesService],
})
export class RacesModule {}
