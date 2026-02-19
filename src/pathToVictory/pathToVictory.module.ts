import { Module } from '@nestjs/common'
import { BallotReadyService } from 'src/elections/services/ballotReady.service'
import { SegmentModule } from 'src/vendors/segment/segment.module'
import { SlackModule } from 'src/vendors/slack/slack.module'
import { AiModule } from '../ai/ai.module'
import { ElectionsModule } from '../elections/elections.module'
import { EmailModule } from '../email/email.module'
import { PrismaModule } from '../prisma/prisma.module'
import { QueueProducerModule } from '../queue/producer/queueProducer.module'
import { VotersModule } from '../voters/voters.module'
import { PathToVictoryController } from './pathToVictory.controller'
import { EnqueuePathToVictoryService } from './services/enqueuePathToVictory.service'
import { OfficeMatchService } from './services/officeMatch.service'
import { PathToVictoryService } from './services/pathToVictory.service'
import { ClerkClientProvider } from '@/authentication/providers/clerk-client.provider'

@Module({
  imports: [
    PrismaModule,
    AiModule,
    ElectionsModule,
    VotersModule,
    EmailModule,
    QueueProducerModule,
    SegmentModule,
    SlackModule,
  ],
  controllers: [PathToVictoryController],
  providers: [
    PathToVictoryService,
    OfficeMatchService,
    EnqueuePathToVictoryService,
    BallotReadyService,
    ClerkClientProvider,
  ],
  exports: [
    PathToVictoryService,
    OfficeMatchService,
    EnqueuePathToVictoryService,
    BallotReadyService,
  ],
})
export class PathToVictoryModule {}
