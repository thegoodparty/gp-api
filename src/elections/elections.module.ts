import { HttpModule } from '@nestjs/axios'
import { forwardRef, Module } from '@nestjs/common'
import { AiModule } from '../ai/ai.module'
import { CampaignsModule } from '../campaigns/campaigns.module'
import { EmailModule } from '../email/email.module'
import { VotersModule } from '../voters/voters.module'
import { ElectionsController } from './elections.controller'
import { BallotReadyService } from './services/ballotReady.service'
import { CensusEntitiesService } from './services/censusEntities.service'
import { CountiesService } from './services/counties.service'
import { ElectionsService } from './services/elections.service'
import { ElectionTypeService } from './services/electionType.service'
import { MunicipalitiesService } from './services/municipalities.service'
import { RacesService } from './services/races.service'

@Module({
  controllers: [ElectionsController],
  providers: [
    RacesService,
    MunicipalitiesService,
    CountiesService,
    CensusEntitiesService,
    ElectionTypeService,
    BallotReadyService,
    ElectionsService,
  ],
  exports: [RacesService, ElectionsService],
  imports: [
    AiModule,
    EmailModule,
    VotersModule,
    forwardRef(() => CampaignsModule),
    HttpModule,
  ],
})
export class ElectionsModule {}
