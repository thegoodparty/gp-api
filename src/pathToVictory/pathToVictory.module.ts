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

@Module({
  imports: [
    PrismaModule,
    AiModule,
    ElectionsModule,
    VotersModule,
    EmailModule,
    QueueProducerModule,
  ],
  providers: [
    PathToVictoryService,
    OfficeMatchService,
    EnqueuePathToVictoryService,
  ],
  exports: [
    PathToVictoryService,
    OfficeMatchService,
    EnqueuePathToVictoryService,
  ],
})
export class PathToVictoryModule {}
