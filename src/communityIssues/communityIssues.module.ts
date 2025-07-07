import { Module } from '@nestjs/common'
import { CommunityIssuesController } from './controllers/communityIssues.controller'
import { CommunityIssuesService } from './services/communityIssues.service'
import { CommunityIssueStatusLogService } from './services/communityIssueStatusLog.service'

@Module({
  controllers: [CommunityIssuesController],
  providers: [CommunityIssuesService, CommunityIssueStatusLogService],
  exports: [CommunityIssuesService, CommunityIssueStatusLogService],
})
export class CommunityIssuesModule {}
