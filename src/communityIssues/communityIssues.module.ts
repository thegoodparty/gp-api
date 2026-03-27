import { Module } from '@nestjs/common'
import { ClerkModule } from '@/vendors/clerk/clerk.module'
import { CommunityIssuesController } from './controllers/communityIssues.controller'
import { CommunityIssuesService } from './services/communityIssues.service'
import { CommunityIssueStatusLogService } from './services/communityIssueStatusLog.service'

@Module({
  imports: [ClerkModule],
  controllers: [CommunityIssuesController],
  providers: [CommunityIssuesService, CommunityIssueStatusLogService],
  exports: [CommunityIssuesService, CommunityIssueStatusLogService],
})
export class CommunityIssuesModule {}
