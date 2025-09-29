import { Module } from '@nestjs/common'
import { HttpModule } from '@nestjs/axios'
import { SlackService } from './services/slack.service'

@Module({
  imports: [HttpModule],
  providers: [SlackService],
  exports: [SlackService],
})
export class SlackModule {}
