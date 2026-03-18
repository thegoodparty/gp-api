import { ElectionsService } from '@/elections/services/elections.service'
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common'
import { Campaign, ElectedOffice, Organization } from '@prisma/client'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { PatchOrganizationDto } from '../schemas/organization.schema'
import pmap from 'p-map'

export type FriendlyOrganization = {
  slug: string
  customPositionName: string | null
  position: { id: string; name: string; brPositionId: string } | null
  district: { id: string; l2Type: string; l2Name: string } | null
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
    return await Promise.all(orgs.map((org) => this.makeFriendly(org)))
  }

  async getOrganization(userId: number, slug: string) {
    const org = await this.model.findUnique({
      where: { slug, ownerId: userId },
      include: { campaign: true, electedOffice: true },
    })
    if (!org) {
      throw new NotFoundException('Organization not found')
    }

    return this.makeFriendly(org)
  }

  async patchOrganization(
    userId: number,
    slug: string,
    updates: PatchOrganizationDto,
  ) {
    const org = await this.getOrganization(userId, slug)

    let position: { id: string } | null = org.position

    if (updates.ballotReadyPositionId) {
      position = await this.electionsService.getPositionByBallotReadyId(
        updates.ballotReadyPositionId,
        { includeDistrict: true },
      )

      if (!position) {
        throw new BadRequestException('Position not found')
      }
    }

    const updated = await this.client.organization.update({
      where: { slug: org.slug },
      data: {
        positionId: position?.id ?? null,
        overrideDistrictId: updates.overrideDistrictId,
        customPositionName: updates.customPositionName,
      },
      include: { campaign: true, electedOffice: true },
    })

    return this.makeFriendly(updated)
  }

  async adminListOrganizations(filter: string | undefined) {
    const organizations = await this.client.organization.findMany({
      where: {
        owner: {
          email: { contains: filter },
        },
      },
      include: { owner: true, campaign: true, electedOffice: true },
      // This is important to prevent the query from scanning the whole table.
      take: 25,
    })

    return pmap(
      organizations,
      async (org) => {
        const orgWithPosition = await this.makeFriendly(org)
        return { ...orgWithPosition, owner: org.owner }
      },
      {
        concurrency: 5,
      },
    )
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
    positionId: string,
  ): Promise<string | null> {
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

  private async makeFriendly(
    org: Organization & {
      campaign: Campaign | null
      electedOffice: ElectedOffice | null
    },
  ): Promise<FriendlyOrganization> {
    const [position, overrideDistrict] = await Promise.all([
      org.positionId
        ? await this.electionsService
            .getPositionById(org.positionId)
            .then((position) => {
              if (!position) {
                throw new InternalServerErrorException(
                  'Organization references a non-existent position',
                )
              }
              return position
            })
        : Promise.resolve(null),
      org.overrideDistrictId
        ? this.electionsService
            .getDistrict(org.overrideDistrictId)
            .then((district) => {
              if (!district) {
                throw new InternalServerErrorException(
                  'Organization references a non-existent district',
                )
              }
              return district
            })
        : Promise.resolve(null),
    ])

    const district = overrideDistrict ?? position?.district

    return {
      slug: org.slug,
      customPositionName: org.customPositionName,
      position: position
        ? {
            id: position.id,
            name: position.name,
            brPositionId: position.brPositionId,
          }
        : null,
      district: district
        ? {
            id: district.id,
            l2Type: district.L2DistrictType,
            l2Name: district.L2DistrictName,
          }
        : null,
      campaign: org.campaign,
      electedOffice: org.electedOffice,
    }
  }
}
