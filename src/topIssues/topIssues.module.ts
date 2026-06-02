import { Module } from '@nestjs/common'
import { TopIssuesController } from './topIssues.controller'
import { TopIssuesService } from './topIssues.service'
import { PositionsController } from './positions/positions.controller'
import { PositionsService } from './positions/positions.service'
import { LlmModule } from '@/llm/llm.module'
@Module({
  imports: [LlmModule],
  controllers: [TopIssuesController, PositionsController],
  providers: [TopIssuesService, PositionsService],
})
export class TopIssuesModule {}
