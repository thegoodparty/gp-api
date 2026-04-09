import { Module } from '@nestjs/common'
import { ElectedOfficeModule } from '@/electedOffice/electedOffice.module'
import { OrganizationsModule } from '@/organizations/organizations.module'
import { AwsModule } from '@/vendors/aws/aws.module'
import { MeetingsController } from './controllers/meetings.controller'
import { MeetingsService } from './services/meetings.service'

@Module({
  imports: [ElectedOfficeModule, OrganizationsModule, AwsModule],
  controllers: [MeetingsController],
  providers: [MeetingsService],
  exports: [MeetingsService],
})
export class MeetingsModule {}
