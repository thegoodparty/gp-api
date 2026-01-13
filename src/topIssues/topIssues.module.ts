import { Module } from '@nestjs/common'
import { AiModule } from '../ai/ai.module'
import { PositionsController } from './positions/positions.controller'
import { PositionsService } from './positions/positions.service'
import { TopIssuesController } from './topIssues.controller'
import { TopIssuesService } from './topIssues.service'
@Module({
  imports: [AiModule],
  controllers: [TopIssuesController, PositionsController],
  providers: [TopIssuesService, PositionsService],
})
export class TopIssuesModule {}
