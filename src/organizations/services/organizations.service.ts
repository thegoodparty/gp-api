import { ElectionsService } from '@/elections/services/elections.service'
import { PositionWithOptionalDistrict } from '@/elections/types/elections.types'
import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common'
import { Campaign, ElectedOffice, Organization } from '@prisma/client'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'

export type OrganizationWithPosition = Organization & {
  position: PositionWithOptionalDistrict | null
  campaign: Campaign | null
  electedOffice: ElectedOffice | null
}

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
    const orgs = await this.model.findMany({
      where: { ownerId: userId },
      include: { campaign: true, electedOffice: true },
    })
    return await Promise.all(orgs.map((org) => this.withPosition(org)))
  }

  async getOrganization(userId: number, slug: string) {
    const org = await this.model.findUnique({
      where: { slug, ownerId: userId },
      include: { campaign: true, electedOffice: true },
    })
    if (!org) {
      throw new NotFoundException('Organization not found')
    }

    return this.withPosition(org)
  }

  /**
   * Resolves positionId, customPositionName, and overrideDistrictId from
   * campaign data by calling the election API.
   */
  async resolveOrgData(params: {
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
      ballotReadyPositionId,
      office,
      otherOffice,
      state,
      L2DistrictType,
      L2DistrictName,
    } = params

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
        positionId,
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

  async resolveBallotReadyPositionId(
    positionId?: string,
  ): Promise<string | null> {
    if (!positionId) {
      return null
    }

    const position = await this.electionsService.getPositionById(positionId)
    return position?.brPositionId ?? null
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
      const position = await this.electionsService.getPositionById(positionId, {
        includeDistrict: true,
      })

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

  private async withPosition(
    org: Organization & {
      campaign: Campaign | null
      electedOffice: ElectedOffice | null
    },
  ) {
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
