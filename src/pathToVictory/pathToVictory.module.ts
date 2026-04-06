import { ClerkModule } from '@/vendors/clerk/clerk.module'
import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { PathToVictoryController } from './pathToVictory.controller'
import { PathToVictoryService } from './services/pathToVictory.service'

@Module({
  imports: [PrismaModule, ClerkModule],
  controllers: [PathToVictoryController],
  providers: [PathToVictoryService],
  exports: [PathToVictoryService],
})
export class PathToVictoryModule {}
