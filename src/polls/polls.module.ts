import { Module } from '@nestjs/common'
import { PollsController } from './polls.controller'
import { PollsService } from './services/polls.service'
import { SlackModule } from 'src/vendors/slack/slack.module'
import { ElectedOfficeModule } from 'src/electedOffice/electedOffice.module'

@Module({
  imports: [SlackModule, ElectedOfficeModule],
  providers: [PollsService],
  controllers: [PollsController],
  exports: [PollsService],
})
export class PollsModule {}
