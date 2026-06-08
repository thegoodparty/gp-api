import {
  Controller,
  Get,
  NotFoundException,
  UseInterceptors,
  UsePipes,
} from '@nestjs/common'
import { Organization } from '../generated/prisma'
import { ZodValidationPipe } from 'nestjs-zod'
import { ElectionsService } from '@/elections/services/elections.service'
import { ReqOrganization } from '@/organizations/decorators/ReqOrganization.decorator'
import { UseOrganization } from '@/organizations/decorators/UseOrganization.decorator'
import { OrganizationsService } from '@/organizations/services/organizations.service'
import { ResponseSchema } from '@/shared/decorators/ResponseSchema.decorator'
import { ZodResponseInterceptor } from '@/shared/interceptors/ZodResponse.interceptor'
import {
  VoterIssuesResponse,
  voterIssuesResponseSchema,
} from './schemas/getVoterIssues.schema'

@Controller('onboarding/voter-issues')
@UsePipes(ZodValidationPipe)
@UseInterceptors(ZodResponseInterceptor)
export class OnboardingVoterIssuesController {
  constructor(
    private readonly elections: ElectionsService,
    private readonly organizations: OrganizationsService,
  ) {}

  @Get()
  @UseOrganization()
  @ResponseSchema(voterIssuesResponseSchema)
  async getVoterIssues(
    @ReqOrganization() organization: Organization,
  ): Promise<VoterIssuesResponse> {
    const { district, level } =
      await this.organizations.getDistrictAndLevelForOrgSlug(organization.slug)
    if (!district) {
      throw new NotFoundException(
        `No district associated with organization "${organization.slug}"`,
      )
    }
    // Scope issues to the office's jurisdiction. Without a resolvable level we
    // return nothing rather than the unfiltered national list, which would
    // surface federal topics irrelevant to a local race.
    if (!level) return { issues: [] }
    const issues = await this.elections.getVoterIssues({
      districtId: district.id,
      level,
    })
    return { issues: issues ?? [] }
  }
}
