import { Module } from '@nestjs/common'
import { InngestController } from './inngest.controller'
import { InngestService } from './services/inngest.service'
import { InngestFunctionsService } from './services/inngestFunctions.service'
import { PollsModule } from 'src/polls/polls.module'

@Module({
  imports: [PollsModule],
  controllers: [InngestController],
  providers: [InngestService, InngestFunctionsService],
  exports: [InngestService],
})
export class InngestModule {}
