import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UsePipes,
} from '@nestjs/common'
import { ZodValidationPipe } from 'nestjs-zod'
import {
  OrganizationsService,
  FriendlyOrganization,
} from './services/organizations.service'
import { ReqUser } from '@/authentication/decorators/ReqUser.decorator'
import { User, UserRole } from '@prisma/client'
import {
  AdminListOrganizationsDto,
  PatchOrganizationDto,
} from './schemas/organization.schema'
import { Roles } from '@/authentication/decorators/Roles.decorator'
import { pick } from 'es-toolkit'

type APIOrganization = {
  slug: string
  name: string | null
  position: null | { id: string; brPositionId: string }
  district: null | { id: string; l2Type: string; l2Name: string }
  electedOfficeId: string | null
  campaignId: number | null
}

const toAPIOrganization = (org: FriendlyOrganization): APIOrganization => {
  const result: APIOrganization = {
    slug: org.slug,
    name: null,
    position: null,
    district: null,
    electedOfficeId: null,
    campaignId: null,
  }

  result.position = org.position
    ? { id: org.position.id, brPositionId: org.position.brPositionId }
    : null
  result.district = org.district
    ? {
        id: org.district.id,
        l2Type: org.district.l2Type,
        l2Name: org.district.l2Name,
      }
    : null

  if (org.slug.startsWith('eo-')) {
    result.electedOfficeId = org.slug.replace('eo-', '')
    result.name = org.position?.name ?? null
    if (org.customPositionName) {
      result.name = org.customPositionName
    }
  } else {
    result.campaignId = parseInt(org.slug.replace('campaign-', ''))
    const electionYear = org.campaign?.details.electionDate?.split('-').at(0)
    result.name = [electionYear, 'Campaign'].filter(Boolean).join(' ')
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

  @Patch('/:slug')
  async patchOrganization(
    @Param('slug') slug: string,
    @ReqUser() user: User,
    @Body() updates: PatchOrganizationDto,
  ): Promise<APIOrganization> {
    const org = await this.organizationsService.patchOrganization(
      user.id,
      slug,
      updates,
    )

    return toAPIOrganization(org)
  }

  @Get('/admin/list')
  @Roles(UserRole.admin)
  async adminListOrganizations(@Query() query: AdminListOrganizationsDto) {
    const organizations =
      await this.organizationsService.adminListOrganizations(query.filter)

    return {
      organizations: organizations.map((org) => {
        const apiShape = toAPIOrganization(org)
        return {
          ...apiShape,
          extra: {
            owner: pick(org.owner, [
              'id',
              'email',
              'firstName',
              'lastName',
              'phone',
            ]),
            campaign: org.campaign
              ? pick(org.campaign, ['id', 'slug', 'details'])
              : null,
          },
        }
      }),
    }
  }
}
