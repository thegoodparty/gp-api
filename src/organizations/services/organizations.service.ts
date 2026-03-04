import { ElectionsService } from '@/elections/services/elections.service'
import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common'
import { Organization } from '@prisma/client'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'

export type OrganizationWithPosition = Awaited<
  ReturnType<OrganizationsService['withPosition']>
>

@Injectable()
export class OrganizationsService extends createPrismaBase(
  MODELS.Organization,
) {
  constructor(private readonly electionsService: ElectionsService) {
    super()
  }

  static campaignOrgSlug(campaignId: number): string {
    return `campaign-${campaignId}`
  }

  static electedOfficeOrgSlug(electedOfficeId: string): string {
    return `eo-${electedOfficeId}`
  }

  static resolveCustomPositionName(
    office?: string,
    otherOffice?: string,
  ): string | null {
    const resolved = office === 'Other' ? otherOffice : office
    return resolved || null
  }

  // Used by UseOrganizationGuard to resolve the campaign slug from the user id
  async resolveCampaignSlug(userId: number): Promise<string | null> {
    // this is a client call to simplify dependency injection
    const campaign = await this.client.campaign.findFirst({
      where: { userId },
      select: { id: true },
    })
    return campaign ? OrganizationsService.campaignOrgSlug(campaign.id) : null
  }

  // Used by UseOrganizationGuard to resolve the elected office slug from the user id
  async resolveElectedOfficeSlug(userId: number): Promise<string | null> {
    // this is a client call to simplify dependency injection
    const eo = await this.client.electedOffice.findFirst({
      where: { userId, isActive: true },
      select: { id: true },
    })
    return eo ? OrganizationsService.electedOfficeOrgSlug(eo.id) : null
  }

  async listOrganizations(userId: number) {
    const orgs = await this.model.findMany({ where: { ownerId: userId } })
    return await Promise.all(orgs.map((org) => this.withPosition(org)))
  }

  async getOrganization(userId: number, slug: string) {
    const org = await this.model.findUnique({
      where: { slug, ownerId: userId },
    })
    if (!org) {
      throw new NotFoundException('Organization not found')
    }

    return this.withPosition(org)
  }

  /**
   * Resolves the override district ID for a given position and district selection.
   * Returns null if the selected district exactly matches the position's natural
   * district (no override needed), or the district UUID if it differs.
   */
  async resolveOverrideDistrictId(params: {
    positionId?: string
    state: string
    L2DistrictType: string
    L2DistrictName: string
  }): Promise<string | null> {
    const { positionId, state, L2DistrictType, L2DistrictName } = params

    if (positionId) {
      // Position lookup is best-effort — if it fails, fall through to override.
      const position = await this.electionsService
        .getPositionByBallotReadyId(positionId, { includeDistrict: true })
        .catch(() => null)

      const isExactMatch =
        position?.district?.L2DistrictType === L2DistrictType &&
        position?.district?.L2DistrictName === L2DistrictName

      if (isExactMatch) return null
    }

    return this.electionsService.getDistrictId(
      state,
      L2DistrictType,
      L2DistrictName,
    )
  }

  private async withPosition(org: Organization) {
    if (!org.positionId) {
      return { ...org, position: null }
    }
    const position = await this.electionsService.getPositionById(org.positionId)
    if (!position) {
      this.logger.error(
        { org },
        'Organization references a non-existent position',
      )
      throw new InternalServerErrorException(
        'Organization references a non-existent position',
      )
    }
    return { ...org, position }
  }
}
