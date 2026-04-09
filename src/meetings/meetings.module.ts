import { Module } from '@nestjs/common'
import { ElectedOfficeModule } from 'src/electedOffice/electedOffice.module'
import { OrganizationsModule } from 'src/organizations/organizations.module'
import { AwsModule } from 'src/vendors/aws/aws.module'
import { MeetingsController } from './controllers/meetings.controller'
import { MeetingsService } from './services/meetings.service'

@Module({
  imports: [ElectedOfficeModule, OrganizationsModule, AwsModule],
  controllers: [MeetingsController],
  providers: [MeetingsService],
  exports: [MeetingsService],
})
export class MeetingsModule {}
