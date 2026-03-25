import { HttpModule } from '@nestjs/axios'
import { Module } from '@nestjs/common'
import { SlackModule } from 'src/vendors/slack/slack.module'
import { AiModule } from '../ai/ai.module'
import { EmailModule } from '../email/email.module'
import { ElectionsController } from './elections.controller'
import { BallotReadyService } from './services/ballotReady.service'
import { CensusEntitiesService } from './services/censusEntities.service'
import { ElectionsService } from './services/elections.service'
import { RacesService } from './services/races.service'

@Module({
  controllers: [ElectionsController],
  providers: [
    RacesService,
    CensusEntitiesService,
    BallotReadyService,
    ElectionsService,
  ],
  exports: [RacesService, ElectionsService],
  imports: [AiModule, EmailModule, HttpModule, SlackModule],
})
export class ElectionsModule {}
