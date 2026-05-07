import { forwardRef, Module } from '@nestjs/common'
import { ElectedOfficeModule } from '@/electedOffice/electedOffice.module'
import { ElectionsModule } from '@/elections/elections.module'
import { OrganizationsModule } from '@/organizations/organizations.module'
import { QueueProducerModule } from '@/queue/producer/queueProducer.module'
import { AwsModule } from '@/vendors/aws/aws.module'
import { MeetingsController } from './controllers/meetings.controller'
import { MeetingsService } from './services/meetings.service'

@Module({
  imports: [
    forwardRef(() => ElectedOfficeModule),
    ElectionsModule,
    OrganizationsModule,
    AwsModule,
    QueueProducerModule,
  ],
  controllers: [MeetingsController],
  providers: [MeetingsService],
  exports: [MeetingsService],
})
export class MeetingsModule {}
