import { ElectedOfficeModule } from '@/electedOffice/electedOffice.module'
import { PollsModule } from '@/polls/polls.module'
import { Module } from '@nestjs/common'
import { ContactEngagementController } from './contactEngagement.controller'
import { ContactEngagementService } from './contactEngagement.service'

@Module({
  imports: [ElectedOfficeModule, PollsModule],
  controllers: [ContactEngagementController],
  providers: [ContactEngagementService],
  exports: [ContactEngagementService],
})
export class ContactEngagementModule {}
