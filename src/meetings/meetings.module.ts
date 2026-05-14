import { Module } from '@nestjs/common'
import { ElectedOfficeModule } from '@/electedOffice/electedOffice.module'
import { OrganizationsModule } from '@/organizations/organizations.module'
import { AwsModule } from '@/vendors/aws/aws.module'
import { MeetingsController } from './controllers/meetings.controller'
import { MeetingsV1Controller } from './controllers/meetings.v1.controller'
import { MeetingsService } from './services/meetings.service'
import { MeetingBriefingsService } from './services/meetingBriefings.service'
import { MeetingScheduleService } from './services/meetingSchedule.service'
import { MeetingProjectionService } from './services/meetingProjection.service'

@Module({
  imports: [ElectedOfficeModule, OrganizationsModule, AwsModule],
  controllers: [MeetingsController, MeetingsV1Controller],
  providers: [
    MeetingsService,
    MeetingBriefingsService,
    MeetingScheduleService,
    MeetingProjectionService,
  ],
  exports: [
    MeetingsService,
    MeetingBriefingsService,
    MeetingScheduleService,
    MeetingProjectionService,
  ],
})
export class MeetingsModule {}
