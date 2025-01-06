import { Module } from '@nestjs/common'
import { TopIssuesController } from './topIssues.controller'
import { TopIssuesService } from './topIssues.service'

@Module({
  controllers: [TopIssuesController],
  providers: [TopIssuesService],
})
export class TopIssuesModule {}
