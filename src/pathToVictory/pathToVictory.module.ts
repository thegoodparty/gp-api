import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { PathToVictoryController } from './pathToVictory.controller'
import { PathToVictoryService } from './services/pathToVictory.service'

@Module({
  imports: [PrismaModule],
  controllers: [PathToVictoryController],
  providers: [PathToVictoryService],
  exports: [PathToVictoryService],
})
export class PathToVictoryModule {}
