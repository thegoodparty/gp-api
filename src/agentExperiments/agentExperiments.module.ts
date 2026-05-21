import { Module } from '@nestjs/common'
import { AwsModule } from '@/vendors/aws/aws.module'
import { ExperimentRunsService } from './services/experimentRuns.service'
import './complianceSetupContract'

@Module({
  imports: [AwsModule],
  controllers: [],
  providers: [ExperimentRunsService],
  exports: [ExperimentRunsService],
})
export class AgentExperimentsModule {}
