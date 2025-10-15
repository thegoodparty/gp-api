import { Module } from '@nestjs/common'
import { PollsController } from './polls.controller'
import { PollsService } from './services/polls.service'

@Module({
  imports: [],
  providers: [PollsService],
  controllers: [PollsController],
  exports: [PollsService],
})
export class PollsModule {}
