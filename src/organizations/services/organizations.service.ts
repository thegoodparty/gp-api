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
   * Resolves positionId, customPositionName, and overrideDistrictId for an
   * elected office organization. If the campaign already has an organization,
   * copies its resolved fields instead of re-resolving from the election API.
   */
  async resolveOrgData(params: {
    campaignId: number
    ballotReadyPositionId?: string | null
    office?: string
    otherOffice?: string
    state?: string
    L2DistrictType?: string
    L2DistrictName?: string
  }): Promise<{
    positionId: string | null
    customPositionName: string | null
    overrideDistrictId: string | null
  }> {
    const {
      campaignId,
      ballotReadyPositionId,
      office,
      otherOffice,
      state,
      L2DistrictType,
      L2DistrictName,
    } = params

    // If the campaign already has an organization, copy its resolved fields
    // instead of re-resolving from the election API.
    const campaignOrgSlug = OrganizationsService.campaignOrgSlug(campaignId)
    const campaignOrg = (await this.model.findUnique({
      where: { slug: campaignOrgSlug },
    })) as Organization | null

    if (campaignOrg) {
      return {
        positionId: campaignOrg.positionId,
        customPositionName: campaignOrg.customPositionName,
        overrideDistrictId: campaignOrg.overrideDistrictId,
      }
    }

    // No campaign org exists — resolve from the election API.
    const positionId = ballotReadyPositionId
      ? await this.resolvePositionId(ballotReadyPositionId)
      : null
    const customPositionName = OrganizationsService.resolveCustomPositionName(
      office,
      otherOffice,
    )

    let overrideDistrictId: string | null = null
    if (state && L2DistrictType && L2DistrictName) {
      overrideDistrictId = await this.resolveOverrideDistrictId({
        positionId: ballotReadyPositionId,
        state,
        L2DistrictType,
        L2DistrictName,
      })
    }

    return { positionId, customPositionName, overrideDistrictId }
  }

  /**
   * Resolves the election-api position ID from a BallotReady position ID.
   * Returns null if the position is not found in the election-api.
   * Throws if the election-api call fails (e.g. API down).
   */
  async resolvePositionId(
    ballotReadyPositionId: string,
  ): Promise<string | null> {
    const position = await this.electionsService.getPositionByBallotReadyId(
      ballotReadyPositionId,
    )
    return position?.id ?? null
  }

  /**
   * Resolves the override district ID for a given position and district selection.
   * Returns null if the selected district exactly matches the position's natural
   * district (no override needed), or the district UUID if it differs.
   */
  async resolveOverrideDistrictId(params: {
    positionId?: string | null
    state: string
    L2DistrictType: string
    L2DistrictName: string
  }): Promise<string | null> {
    const { positionId, state, L2DistrictType } = params
    const L2DistrictName = this.electionsService.cleanDistrictName(
      params.L2DistrictName,
    )

    if (positionId) {
      const position = await this.electionsService.getPositionByBallotReadyId(
        positionId,
        { includeDistrict: true },
      )

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
