import { Module } from '@nestjs/common'
import { ElectedOfficeModule } from '@/electedOffice/electedOffice.module'
import { AwsModule } from '@/vendors/aws/aws.module'
import { MeetingsBriefingsController } from './controllers/meetingsBriefings.controller'
import { MeetingBriefingsService } from './services/meetingBriefings.service'

@Module({
  imports: [ElectedOfficeModule, AwsModule],
  controllers: [MeetingsBriefingsController],
  providers: [MeetingBriefingsService],
  exports: [MeetingBriefingsService],
})
export class MeetingsModule {}
