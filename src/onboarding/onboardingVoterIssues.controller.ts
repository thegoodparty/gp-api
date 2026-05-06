import {
  Controller,
  Get,
  NotFoundException,
  UseInterceptors,
  UsePipes,
} from '@nestjs/common'
import { Organization } from '@prisma/client'
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
    const district = await this.organizations.getDistrictForOrgSlug(
      organization.slug,
    )
    if (!district) {
      throw new NotFoundException(
        `No district associated with organization "${organization.slug}"`,
      )
    }
    const issues = await this.elections.getVoterIssues({
      districtId: district.id,
    })
    return { issues: issues ?? [] }
  }
}
