import { ReqUser } from '@/authentication/decorators/ReqUser.decorator'
import { Roles } from '@/authentication/decorators/Roles.decorator'
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UsePipes,
} from '@nestjs/common'
import { User, UserRole } from '@prisma/client'
import { pick } from 'es-toolkit'
import { ZodValidationPipe } from 'nestjs-zod'
import { OrgDistrict } from './organizations.types'
import {
  AdminListOrganizationsDto,
  PatchOrganizationDto,
} from './schemas/organization.schema'
import {
  FriendlyOrganization,
  OrganizationsService,
} from './services/organizations.service'

type APIOrganization = {
  slug: string
  name: string | null
  positionName: string | null
  position: null | { id: string; state: string; brPositionId: string }
  district: null | OrgDistrict
  electedOfficeId: string | null
  campaignId: number | null
}

const toAPIOrganization = (org: FriendlyOrganization): APIOrganization => {
  const result: APIOrganization = {
    slug: org.slug,
    name: null,
    positionName: org.customPositionName ?? org.position?.name ?? null,
    position: null,
    district: null,
    electedOfficeId: null,
    campaignId: null,
  }

  result.position = org.position
    ? {
        id: org.position.id,
        state: org.position.state,
        brPositionId: org.position.brPositionId,
      }
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
    result.name = result.positionName
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

  @Patch('/admin/:slug')
  @Roles(UserRole.admin)
  async adminPatchOrganization(
    @Param('slug') slug: string,
    @Body() updates: PatchOrganizationDto,
  ): Promise<APIOrganization> {
    const org = await this.organizationsService.adminPatchOrganization(
      slug,
      updates,
    )
    return toAPIOrganization(org)
  }

  @Get('/admin/list')
  @Roles(UserRole.admin)
  async adminListOrganizations(@Query() query: AdminListOrganizationsDto) {
    const organizations =
      await this.organizationsService.adminListOrganizations(query)

    return {
      organizations: organizations.map((org) => {
        const apiShape = toAPIOrganization(org)
        return {
          ...apiShape,
          extra: {
            positionName: org.position?.name ?? null,
            hasDistrictOverride: org.hasDistrictOverride,
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
