import { Body, Controller, Get, Param, Post, UsePipes } from '@nestjs/common'
import { ZodValidationPipe } from 'nestjs-zod'
import { Roles } from '@/authentication/decorators/Roles.decorator'
import { ReqUser } from '@/authentication/decorators/ReqUser.decorator'
import { User, UserRole } from '@prisma/client'
import { AgentDispatchService } from './services/agentDispatch.service'
import { CandidateExperimentsService } from './services/candidateExperiments.service'
import {
  DispatchExperimentDto,
  RequestExperimentDto,
} from './schemas/agentExperiments.schema'

@Controller('agent-experiments')
@UsePipes(ZodValidationPipe)
export class AgentExperimentsController {
  constructor(
    private readonly dispatchService: AgentDispatchService,
    private readonly candidateExperiments: CandidateExperimentsService,
  ) {}

  @Post('dispatch')
  @Roles(UserRole.admin)
  dispatch(@Body() body: DispatchExperimentDto) {
    return this.dispatchService.dispatch(body)
  }

  @Get('mine')
  @Roles(UserRole.candidate, UserRole.admin)
  getMyRuns(@ReqUser() user: User) {
    return this.candidateExperiments.getMyRuns(user)
  }

  @Post('request')
  @Roles(UserRole.candidate, UserRole.admin)
  requestExperiment(@ReqUser() user: User, @Body() body: RequestExperimentDto) {
    return this.candidateExperiments.requestExperiment(user, body)
  }

  @Get('available')
  @Roles(UserRole.candidate, UserRole.admin)
  getAvailableExperiments(@ReqUser() user: User) {
    return this.candidateExperiments.getAvailableExperiments(user)
  }

  @Get(':runId/artifact')
  @Roles(UserRole.candidate, UserRole.admin)
  getArtifact(@ReqUser() user: User, @Param('runId') runId: string) {
    return this.candidateExperiments.getArtifact(user, runId)
  }
}
