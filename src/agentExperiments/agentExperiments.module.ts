import { Module } from '@nestjs/common'
import { AwsModule } from '@/vendors/aws/aws.module'
import { ExperimentRunsService } from './services/experimentRuns.service'

@Module({
  imports: [AwsModule],
  controllers: [],
  providers: [ExperimentRunsService],
  exports: [ExperimentRunsService],
})
export class AgentExperimentsModule {}
