import { Module } from '@nestjs/common'
import { BallotReadyService } from 'src/elections/services/ballotReady.service'
import { PrismaModule } from '../prisma/prisma.module'
import { PathToVictoryController } from './pathToVictory.controller'
import { PathToVictoryService } from './services/pathToVictory.service'
import { ClerkClientProvider } from '@/authentication/providers/clerk-client.provider'

@Module({
  imports: [PrismaModule],
  controllers: [PathToVictoryController],
  providers: [PathToVictoryService, BallotReadyService, ClerkClientProvider],
  exports: [PathToVictoryService, BallotReadyService],
})
export class PathToVictoryModule {}
