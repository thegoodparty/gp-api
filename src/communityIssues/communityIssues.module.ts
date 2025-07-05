import { Module } from '@nestjs/common'
import { CommunityIssuesController } from './controllers/communityIssues.controller'
import { CommunityIssuesService } from './services/communityIssues.service'

@Module({
  controllers: [CommunityIssuesController],
  providers: [CommunityIssuesService],
  exports: [CommunityIssuesService],
})
export class CommunityIssuesModule {}
