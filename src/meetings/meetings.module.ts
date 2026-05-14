import { Module } from '@nestjs/common'
import { ElectedOfficeModule } from '@/electedOffice/electedOffice.module'
import { OrganizationsModule } from '@/organizations/organizations.module'
import { AwsModule } from '@/vendors/aws/aws.module'
import { MeetingsController } from './controllers/meetings.controller'
import { MeetingsBriefingsController } from './controllers/meetingsBriefings.controller'
import { MeetingsService } from './services/meetings.service'
import { MeetingBriefingsService } from './services/meetingBriefings.service'

@Module({
  imports: [ElectedOfficeModule, OrganizationsModule, AwsModule],
  controllers: [MeetingsController, MeetingsBriefingsController],
  providers: [MeetingsService, MeetingBriefingsService],
  exports: [MeetingsService, MeetingBriefingsService],
})
export class MeetingsModule {}
