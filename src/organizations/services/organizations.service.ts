import { ElectionsService } from '@/elections/services/elections.service'
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common'
import { Campaign, ElectedOffice, Organization, Prisma } from '@prisma/client'
import pmap from 'p-map'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import {
  AdminListOrganizationsDto,
  PatchOrganizationDto,
} from '../schemas/organization.schema'

import { OrgDistrict } from '../organizations.types'
import { ClerkUserEnricherService } from '@/vendors/clerk/services/clerk-user-enricher.service'

export type FriendlyOrganization = {
  slug: string
  hasDistrictOverride: boolean
  customPositionName: string | null
  position: {
    id: string
    name: string
    state: string
    brPositionId: string
  } | null
  district: OrgDistrict | null
  campaign: Campaign | null
  electedOffice: ElectedOffice | null
}

@Injectable()
export class OrganizationsService extends createPrismaBase(
  MODELS.Organization,
) {
  constructor(
    private readonly electionsService: ElectionsService,
    private readonly clerkEnricher: ClerkUserEnricherService,
  ) {
    super()
  }

  static campaignOrgSlug(campaignId: number): string {
    return `campaign-${campaignId}`
  }

  static electedOfficeOrgSlug(electedOfficeId: string): string {
    return `eo-${electedOfficeId}`
  }

  async resolvePositionNameByOrganizationSlug(
    organizationSlug: string,
  ): Promise<string | null> {
    const { positionName } =
      await this.resolvePositionContextByOrgSlug(organizationSlug)
    return positionName
  }

  async resolvePositionContextByOrgSlug(organizationSlug: string): Promise<{
    ballotReadyPositionId: string | null
    positionName: string | null
  }> {
    const organization = await this.findUnique({
      where: { slug: organizationSlug },
    })

    return this.resolvePositionContext({
      customPositionName: organization?.customPositionName,
      positionId: organization?.positionId,
    })
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

  async adminGetOrganization(slug: string) {
    const org = await this.model.findUnique({
      where: { slug },
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
    return this.applyPatch(org, updates)
  }

  async adminPatchOrganization(slug: string, updates: PatchOrganizationDto) {
    const org = await this.adminGetOrganization(slug)
    return this.applyPatch(org, updates)
  }

  private async applyPatch(
    org: FriendlyOrganization,
    updates: PatchOrganizationDto,
  ) {
    let position: { id: string } | null = org.position

    if ('ballotReadyPositionId' in updates) {
      if (updates.ballotReadyPositionId === null) {
        position = null
      } else if (updates.ballotReadyPositionId) {
        position = await this.electionsService.getPositionByBallotReadyId(
          updates.ballotReadyPositionId,
          { includeDistrict: true },
        )

        if (!position) {
          throw new BadRequestException('Position not found')
        }
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

  async adminListOrganizations(query: AdminListOrganizationsDto) {
    const OR: Prisma.OrganizationWhereInput[] = []
    if (query.slug) {
      OR.push({ slug: query.slug })
    }
    if (query.email) {
      OR.push({ owner: { email: { contains: query.email } } })
    }

    const organizations = await this.client.organization.findMany({
      where: { OR },
      include: { owner: true, campaign: true, electedOffice: true },
      // This is important to prevent the query from scanning the whole table.
      take: 25,
    })

    const owners = organizations
      .map((o) => o.owner)
      .filter((o): o is NonNullable<typeof o> => o != null)
    const enrichedOwners = await this.clerkEnricher.enrichUsers(owners)
    let idx = 0
    for (const org of organizations) {
      if (org.owner) {
        org.owner = enrichedOwners[idx++]
      }
    }

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
    customPositionName?: string | null
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
      customPositionName,
      state,
      L2DistrictType,
      L2DistrictName,
    } = params

    const positionId = ballotReadyPositionId
      ? await this.resolvePositionId(ballotReadyPositionId)
      : null

    let overrideDistrictId: string | null = null
    if (state && L2DistrictType && L2DistrictName) {
      overrideDistrictId = await this.resolveOverrideDistrictId({
        positionId,
        state,
        L2DistrictType,
        L2DistrictName,
      })
    }

    return {
      positionId,
      customPositionName: customPositionName ?? null,
      overrideDistrictId,
    }
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

  async resolvePositionContext(params: {
    customPositionName?: string | null
    positionId?: string | null
  }): Promise<{
    ballotReadyPositionId: string | null
    positionName: string | null
  }> {
    const { customPositionName, positionId } = params

    if (!positionId) {
      return {
        ballotReadyPositionId: null,
        positionName: customPositionName ?? null,
      }
    }

    const position = await this.electionsService.getPositionById(positionId)
    if (!position) {
      throw new InternalServerErrorException(
        `Stored positionId ${positionId} does not exist in election-api`,
      )
    }
    return {
      ballotReadyPositionId: position.brPositionId ?? null,
      positionName: customPositionName || position.name || null,
    }
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

  /**
   * Derives a city slug for an organization by resolving its position and district
   * from the election-api, then extracting city name + state.
   *
   * The slug format matches the meeting_pipeline convention:
   *   "Fayetteville", "NC" → "fayetteville-NC"
   *   "Canal Winchester", "OH" → "canal-winchester-OH"
   *
   * City name extraction is best-effort: L2DistrictName for city-level positions
   * is usually just the city name, but ward/district positions may include suffixes
   * like "Fayetteville Ward 4" or prefixes like "City of Kyle". These are stripped
   * using known patterns. If extraction is unclear, returns null.
   *
   * Callers should treat a null return as "city not resolvable" and fall back
   * to a stored value or manual configuration.
   */
  async resolveCitySlug(org: Organization): Promise<string | null> {
    const [district, position] = await Promise.all([
      this.resolveDistrict(org),
      org.positionId
        ? this.electionsService.getPositionById(org.positionId, {
            includeDistrict: false,
          })
        : Promise.resolve(null),
    ])

    const state = position?.state
    if (!state || !district?.l2Name) return null

    const city = OrganizationsService.extractCityFromDistrictName(
      district.l2Name,
    )
    if (!city) return null

    const citySlug = city
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[.']/g, '')
    return `${citySlug}-${state.toUpperCase()}`
  }

  /**
   * Extracts a clean city name from an L2DistrictName string.
   *
   * Handles known patterns:
   *   "Fayetteville Ward 4"          → "Fayetteville"
   *   "Kyle District 3"              → "Kyle"
   *   "City of Kyle"                 → "Kyle"
   *   "Town of Chapel Hill"          → "Chapel Hill"
   *   "Fayetteville"                 → "Fayetteville"  (already clean)
   *   "Pocatello City (Est.)"        → "Pocatello"
   *   "North Port City (Est.)"       → "North Port"
   *   "West Mifflin Boro"            → "West Mifflin"
   *   "Alvin City Cncl D"            → "Alvin"
   *   "Dubuque City Ward 3"          → "Dubuque"
   *
   * Returns null if the result is empty or looks like a non-city name.
   */
  static extractCityFromDistrictName(districtName: string): string | null {
    let name = districtName.trim()

    // Strip leading "City of", "Town of", "Village of", "Borough of"
    name = name.replace(/^(City|Town|Village|Borough|Township)\s+of\s+/i, '')

    // Strip trailing parenthetical qualifiers: "(Est.)", "(Ind.)", "(Pt.)", etc.
    name = name.replace(/\s*\([^)]*\)\.?\s*$/i, '')

    // Strip trailing abbreviated council/district suffixes before ward/district stripping:
    // "Cncl D", "Cncl Dist", "Council D", "Council Dist"
    name = name.replace(/\s+Cncl\s*(D(ist)?\.?)?\s*$/i, '')
    name = name.replace(/\s+Council\s+D(ist)?\.?\s*$/i, '')

    // Strip trailing ward/district/precinct suffixes: "Ward 4", "District 3", "Precinct 2A"
    name = name.replace(
      /\s+(Ward|District|Precinct|Division|At-Large)\s*[\w-]*$/i,
      '',
    )

    // Strip trailing municipality type: "Johnstown City" → "Johnstown"
    // Includes "Boro" as a short form of "Borough"
    name = name.replace(/\s+(City|Town|Village|Borough|Boro|Township)$/i, '')

    name = name.trim()

    // Reject if empty or looks non-city (pure number, single char, etc.)
    if (!name || name.length < 2 || /^\d+$/.test(name)) return null

    return name
  }

  async getDistrictForOrgSlug(slug: string): Promise<OrgDistrict | null> {
    const org = await this.model.findUnique({ where: { slug } })
    if (!org) return null

    return this.resolveDistrict(org)
  }

  private async resolveDistrict(
    org: Organization,
  ): Promise<OrgDistrict | null> {
    const [position, overrideDistrict] = await Promise.all([
      org.positionId
        ? this.electionsService.getPositionById(org.positionId, {
            includeDistrict: true,
          })
        : Promise.resolve(null),
      org.overrideDistrictId
        ? this.electionsService.getDistrict(org.overrideDistrictId)
        : Promise.resolve(null),
    ])

    const district = overrideDistrict ?? position?.district
    if (!district) return null

    return {
      id: district.id,
      l2Type: district.L2DistrictType,
      l2Name: district.L2DistrictName,
    }
  }

  private async makeFriendly(
    org: Organization & {
      campaign: Campaign | null
      electedOffice: ElectedOffice | null
    },
  ): Promise<FriendlyOrganization> {
    const [position, overrideDistrict] = await Promise.all([
      org.positionId
        ? this.electionsService
            .getPositionById(org.positionId, { includeDistrict: true })
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
        ? this.electionsService.getDistrict(org.overrideDistrictId)
        : Promise.resolve(null),
    ])

    const rawDistrict = overrideDistrict ?? position?.district
    const district: OrgDistrict | null = rawDistrict
      ? {
          id: rawDistrict.id,
          l2Type: rawDistrict.L2DistrictType,
          l2Name: rawDistrict.L2DistrictName,
        }
      : null

    return {
      slug: org.slug,
      hasDistrictOverride: !!org.overrideDistrictId,
      customPositionName: org.customPositionName,
      position: position
        ? {
            id: position.id,
            name: position.name,
            state: position.state,
            brPositionId: position.brPositionId,
          }
        : null,
      district,
      campaign: org.campaign,
      electedOffice: org.electedOffice,
    }
  }
}
