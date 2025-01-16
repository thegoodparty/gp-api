import { Global, Module } from '@nestjs/common'
import { SlackService } from './services/slack.service'
import { HttpModule } from '@nestjs/axios'

@Global()
@Module({
  imports: [HttpModule],
  providers: [SlackService],
  exports: [SlackService],
})
export class SharedModule {}
