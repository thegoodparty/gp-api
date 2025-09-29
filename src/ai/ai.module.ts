import { Module } from '@nestjs/common'
import { AiService } from './ai.service'
import { SlackModule } from 'src/vendors/slack/slack.module'

@Module({
  imports: [SlackModule],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
