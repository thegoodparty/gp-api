import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { PathToVictoryService } from './services/pathToVictory.service'
import { OfficeMatchService } from './services/officeMatch.service'
import { ElectionsModule } from '../elections/elections.module'
import { VotersModule } from '../voters/voters.module'
import { EnqueuePathToVictoryService } from './services/enqueuePathToVictory.service'
import { QueueProducerModule } from '../queue/producer/producer.module'
import { EmailModule } from '../email/email.module'
import { AiModule } from '../ai/ai.module'
import { ViabilityService } from './services/viability.service'
import { BallotReadyService } from 'src/elections/services/ballotReady.service'
import { PathToVictoryController } from './pathToVictory.controller'
import { ViabilityController } from './viability.controller'

@Module({
  imports: [
    PrismaModule,
    AiModule,
    ElectionsModule,
    VotersModule,
    EmailModule,
    QueueProducerModule,
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
