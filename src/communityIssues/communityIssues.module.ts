import { Module } from '@nestjs/common'
import { CommunityIssuesController } from './controllers/communityIssues.controller'
import { CommunityIssueStatusLogService } from './services/communityIssueStatusLog.service'
import { CommunityIssuesService } from './services/communityIssues.service'

@Module({
  controllers: [CommunityIssuesController],
  providers: [CommunityIssuesService, CommunityIssueStatusLogService],
  exports: [CommunityIssuesService, CommunityIssueStatusLogService],
})
export class CommunityIssuesModule {}
