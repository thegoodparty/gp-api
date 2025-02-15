import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { PathToVictoryService } from './services/pathToVictory.service'
import { OfficeMatchService } from './services/officeMatch.service'
import { ElectionsModule } from '../elections/elections.module'
import { VotersModule } from '../voters/voters.module'

@Module({
  imports: [PrismaModule, ElectionsModule, VotersModule],
  providers: [PathToVictoryService, OfficeMatchService],
  exports: [PathToVictoryService, OfficeMatchService],
})
export class PathToVictoryModule {}
