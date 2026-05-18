import { Injectable } from '@nestjs/common'
import { ElectionsService } from '@/elections/services/elections.service'
import type { MandatoryFilter } from '@/llm/tools/districtInsights.tool'
import { OrganizationsService } from '@/organizations/services/organizations.service'
import { createPrismaBase, MODELS } from '@/prisma/util/prisma.util'

export interface DistrictResolution {
  state: string
  l2DistrictType: string
  l2DistrictName: string
}

const STATE_COLUMN = 'state_postal_code'

@Injectable()
export class DistrictResolverService extends createPrismaBase(
  MODELS.ElectedOffice,
) {
  constructor(
    private readonly organizations: OrganizationsService,
    private readonly elections: ElectionsService,
  ) {
    super()
  }

  async resolveByUserId(userId: number): Promise<DistrictResolution | null> {
    const electedOffice = await this.model.findFirst({ where: { userId } })
    if (!electedOffice) return null

    const org = await this.client.organization.findUnique({
      where: { slug: electedOffice.organizationSlug },
    })
    if (!org) return null
    if (!org.positionId && !org.overrideDistrictId) return null
    if (!org.positionId) return null

    const [district, position] = await Promise.all([
      this.organizations.getDistrictForOrgSlug(electedOffice.organizationSlug),
      this.elections.getPositionById(org.positionId, {
        includeDistrict: true,
      }),
    ])

    if (!district) return null
    if (!position || !position.state || position.state.length === 0) {
      return null
    }

    return {
      state: position.state,
      l2DistrictType: district.l2Type,
      l2DistrictName: district.l2Name,
    }
  }

  toMandatoryFilters(resolved: DistrictResolution): MandatoryFilter[] {
    return [
      { column: STATE_COLUMN, value: resolved.state },
      { column: resolved.l2DistrictType, value: resolved.l2DistrictName },
    ]
  }
}
