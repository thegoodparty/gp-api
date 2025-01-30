import { Module } from '@nestjs/common'
import { RacesService } from './services/races.service'
import { RacesController } from './races.controller'
import { GraphqlModule } from 'src/graphql/graphql.module'
import { MunicipalitiesService } from './services/municipalities.services'
import { CountiesService } from './services/counties.services'
import { CensusEntitiesService } from './services/censusEntities.services'

@Module({
  controllers: [RacesController],
  providers: [
    RacesService,
    MunicipalitiesService,
    CountiesService,
    CensusEntitiesService,
  ],
  imports: [GraphqlModule],
  exports: [RacesService],
})
export class RacesModule {}
