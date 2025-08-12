import { Module } from '@nestjs/common'
import { BallotReadyService } from 'src/elections/services/ballotReady.service'
import { SegmentModule } from 'src/segment/segment.module'
import { AiModule } from '../ai/ai.module'
import { ElectionsModule } from '../elections/elections.module'
import { EmailModule } from '../email/email.module'
import { PrismaModule } from '../prisma/prisma.module'
import { QueueProducerModule } from '../queue/producer/producer.module'
import { VotersModule } from '../voters/voters.module'
import { PathToVictoryController } from './pathToVictory.controller'
import { EnqueuePathToVictoryService } from './services/enqueuePathToVictory.service'
import { OfficeMatchService } from './services/officeMatch.service'
import { PathToVictoryService } from './services/pathToVictory.service'
import { ViabilityService } from './services/viability.service'
import { ViabilityController } from './viability.controller'

@Module({
  imports: [
    PrismaModule,
    AiModule,
    ElectionsModule,
    VotersModule,
    EmailModule,
    QueueProducerModule,
    SegmentModule,
    ElectionsModule,
  ],
  controllers: [PathToVictoryController, ViabilityController],
  providers: [
    PathToVictoryService,
    OfficeMatchService,
    EnqueuePathToVictoryService,
    ViabilityService,
    BallotReadyService,
  ],
  exports: [
    PathToVictoryService,
    OfficeMatchService,
    EnqueuePathToVictoryService,
    ViabilityService,
    BallotReadyService,
  ],
})
export class PathToVictoryModule {}
