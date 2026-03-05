import { Controller, Get, Param, UsePipes } from '@nestjs/common'
import { ZodValidationPipe } from 'nestjs-zod'
import {
  OrganizationsService,
  OrganizationWithPosition,
} from './services/organizations.service'
import { ReqUser } from '@/authentication/decorators/ReqUser.decorator'
import { User } from '@prisma/client'

type APIOrganization = {
  slug: string
  position: { id: string; name: string } | null
  electedOfficeId: string | null
  campaignId: number | null
}

const toAPIOrganization = (org: OrganizationWithPosition): APIOrganization => {
  const result: APIOrganization = {
    slug: org.slug,
    position: org.position
      ? { id: org.position.id, name: org.position.name }
      : null,
    electedOfficeId: null,
    campaignId: null,
  }

  if (org.slug.startsWith('eo-')) {
    result.electedOfficeId = org.slug.replace('eo-', '')
  } else {
    result.campaignId = parseInt(org.slug.replace('campaign-', ''))
  }
  return result
}

@Controller('organizations')
@UsePipes(ZodValidationPipe)
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get('/')
  async listOrganizations(
    @ReqUser() user: User,
  ): Promise<{ organizations: APIOrganization[] }> {
    const organizations = await this.organizationsService.listOrganizations(
      user.id,
    )

    return {
      organizations: organizations.map(toAPIOrganization),
    }
  }

  @Get('/:slug')
  async getOrganization(
    @Param('slug') slug: string,
    @ReqUser() user: User,
  ): Promise<APIOrganization> {
    const org = await this.organizationsService.getOrganization(user.id, slug)
    return toAPIOrganization(org)
  }
}
