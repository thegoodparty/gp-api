import { Module } from '@nestjs/common'
import { AwsModule } from '@/vendors/aws/aws.module'
import { AgentExperimentsController } from './agentExperiments.controller'
import { AgentDispatchService } from './services/agentDispatch.service'
import { ExperimentRunsService } from './services/experimentRuns.service'
import { CandidateExperimentsService } from './services/candidateExperiments.service'
import { ExperimentSweeperService } from './services/experimentSweeper.service'

@Module({
  imports: [AwsModule],
  controllers: [AgentExperimentsController],
  providers: [
    AgentDispatchService,
    ExperimentRunsService,
    CandidateExperimentsService,
    ExperimentSweeperService,
  ],
  exports: [ExperimentRunsService],
})
export class AgentExperimentsModule {}
