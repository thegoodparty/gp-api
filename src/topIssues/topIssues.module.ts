import { Module } from '@nestjs/common'
import { TopIssuesController } from './topIssues.controller'
import { TopIssuesService } from './topIssues.service'
import { PositionsController } from './positions/positions.controller'
import { PositionsService } from './positions/positions.service'
import { AiModule } from '../ai/ai.module'
@Module({
  imports: [AiModule],
  controllers: [TopIssuesController, PositionsController],
  providers: [TopIssuesService, PositionsService],
})
export class TopIssuesModule {}
