import { forwardRef, Module } from '@nestjs/common'
import { RacesService } from './services/races.service'
import { MunicipalitiesService } from './services/municipalities.service'
import { CountiesService } from './services/counties.service'
import { CensusEntitiesService } from './services/censusEntities.service'
import { ElectionTypeService } from './services/electionType.service'
import { BallotReadyService } from './services/ballotReady.service'
import { ElectionsController } from './elections.controller'
import { AiModule } from '../ai/ai.module'
import { EmailModule } from '../email/email.module'
import { CampaignsModule } from '../campaigns/campaigns.module'
import { VotersModule } from '../voters/voters.module'
import { ElectionsService } from './services/elections.service'
import { HttpModule } from '@nestjs/axios'

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
