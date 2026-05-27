import { Module, forwardRef } from '@nestjs/common'
import { AgentExperimentsModule } from '@/agentExperiments/agentExperiments.module'
import { ElectedOfficeModule } from '@/electedOffice/electedOffice.module'
import { ElectionsModule } from '@/elections/elections.module'
import { OrganizationsModule } from '@/organizations/organizations.module'
import { AwsModule } from '@/vendors/aws/aws.module'
import { SegmentModule } from '@/vendors/segment/segment.module'
import { LlmModule } from '@/llm/llm.module'
import { MeetingsBriefingsController } from './controllers/meetingsBriefings.controller'
import { MeetingBriefingsService } from './services/meetingBriefings.service'

@Module({
  imports: [
    AgentExperimentsModule,
    forwardRef(() => ElectedOfficeModule),
    ElectionsModule,
    OrganizationsModule,
    AwsModule,
    SegmentModule,
    LlmModule,
  ],
  controllers: [MeetingsBriefingsController],
  providers: [MeetingBriefingsService],
  exports: [MeetingBriefingsService],
})
export class MeetingsModule {}
