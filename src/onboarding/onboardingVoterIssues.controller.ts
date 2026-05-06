import { Controller, Get, Query, UsePipes } from '@nestjs/common'
import { ZodValidationPipe } from 'nestjs-zod'
import { ElectionsService } from '@/elections/services/elections.service'
import {
  GetVoterIssuesQueryDTO,
  VoterIssuesResponse,
} from './schemas/getVoterIssues.schema'

@Controller('onboarding/voter-issues')
@UsePipes(ZodValidationPipe)
export class OnboardingVoterIssuesController {
  constructor(private readonly elections: ElectionsService) {}

  @Get()
  async getVoterIssues(
    @Query() query: GetVoterIssuesQueryDTO,
  ): Promise<VoterIssuesResponse> {
    const issues = await this.elections.getVoterIssues({
      districtId: query.districtId,
      ballotReadyPositionId: query.ballotReadyPositionId,
      state: query.state,
      city: query.city,
    })
    return { issues: issues ?? [] }
  }
}
