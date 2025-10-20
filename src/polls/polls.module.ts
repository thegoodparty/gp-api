import { Module } from '@nestjs/common'
import { PollsController } from './polls.controller'
import { PollsService } from './services/polls.service'
import { SlackModule } from 'src/vendors/slack/slack.module'
import { ElectedOfficeModule } from 'src/electedOffice/electedOffice.module'
import { PollIssuesService } from './services/pollIssues.service'

@Module({
  imports: [SlackModule, ElectedOfficeModule],
  providers: [PollsService, PollIssuesService],
  controllers: [PollsController],
  exports: [PollsService, PollIssuesService],
})
export class PollsModule {}
