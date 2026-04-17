import { ElectionsService } from '@/elections/services/elections.service'
import { Injectable } from '@nestjs/common'
import { Campaign, ElectedOffice } from '@prisma/client'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { OrganizationsService } from './organizations.service'

export type BackfillDryRunRecord = {
  type: 'campaign' | 'elected-office'
  id: number | string
  slug: string
  userId: number
  existingOrg: {
    positionId: string | null
    overrideDistrictId: string | null
    customPositionName: string | null
  } | null
  resolved: {
    positionId: string | null
    overrideDistrictId: string | null
    customPositionName: string | null
    category: string
  } | null
  wouldWrite: boolean
  wouldCreate: boolean
  wouldLinkRecord: boolean
  inputFields: {
    error: string | null
    state: string
    ballotReadyPositionId: string | null
    L2DistrictType: string
    L2DistrictName: string
    office: string
    otherOffice: string
  } | null
  error?: string
}

/** Categories describing the outcome of resolving an organization's position/district. */
export const BackfillCategory = {
  /** Org already had positionId or overrideDistrictId — no work needed. */
  SKIPPED_ALREADY_POPULATED: 'skipped_already_populated',
  /** Position found in election-api, district matches p2v exactly. */
  EXACT_MATCH: 'exact_match',
  /** Position found, but district differs from p2v — override district set. */
  OVERRIDE_DISTRICT: 'override_district',
  /** Position found, district differs, but missing p2v data to look up override. */
  POSITION_ONLY_MISSING_P2V_DISTRICT: 'position_only_missing_p2v_district',
  /** Position found in election-api but it has no district attached. */
  POSITION_ONLY_NO_DISTRICT_ON_POSITION:
    'position_only_no_district_on_position',
  /** No position in election-api, but district looked up from p2v data. */
  DISTRICT_ONLY: 'district_only',
  /** No positionId on campaign and no p2v district data — nothing to resolve. */
  NO_DATA: 'no_data',
  /** campaign.details is not an object — cannot extract fields. */
  INVALID_DETAILS: 'invalid_details',
  /** Election API returned null for the given ballotReady position ID. */
  POSITION_NOT_FOUND: 'position_not_found',
  /** District lookup returned null — no matching district in election-api. */
  DISTRICT_NOT_FOUND: 'district_not_found',
} as const

/**
 * Ensures every Campaign and ElectedOffice has a corresponding Organization
 * row populated with the best available position and district data from the
 * election-api. Call `backfillOrganizations()` to run the real backfill, or
 * `dryRun()` to preview what would happen without writing.
 *
 * ## Why this exists
 * Organizations were introduced after Campaigns and ElectedOffices already
 * existed. This backfill creates Organization rows for any records that
 * don't have one yet, and fixes existing ones that are missing
 * position/district data.
 *
 * ## High-level flow
 * 1. Iterate all Campaigns in batches (cursor-based pagination).
 * 2. For each campaign, resolve the best position + district from the
 *    election-api using the campaign's BallotReady positionId and/or
 *    district data used for organization resolution.
 * 3. Upsert an Organization row with the resolved data.
 * 4. Repeat the same process for ElectedOffices (which share their
 *    campaign's position/district data but get their own Organization).
 * 5. Log per-category stats at the end for observability.
 */
@Injectable()
export class OrganizationsBackfillService extends createPrismaBase(
  MODELS.Organization,
) {
  constructor(
    private readonly electionsService: ElectionsService,
    private readonly organizationsService: OrganizationsService,
  ) {
    super()
  }

  private static BATCH_SIZE = 100

  /** Creates a zeroed-out counter for each backfill category (plus 'error'). */
  private static newCategoryCounts(): Record<string, number> {
    const counts: Record<string, number> = { error: 0 }
    for (const category of Object.values(BackfillCategory)) {
      counts[category] = 0
    }
    return counts
  }

  /** Entry point — call manually from a script or ECS task. */
  async backfillOrganizations() {
    this.logger.info('[organization backfill] Starting organization backfill')
    const campaignStats = await this.backfillCampaignOrganizations()
    const eoStats = await this.backfillElectedOfficeOrganizations()
    this.logger.info(
      { campaignStats, electedOfficeStats: eoStats },
      '[organization backfill] Organization backfill complete',
    )
    return { campaignStats, eoStats }
  }

  // ---------------------------------------------------------------------------
  // Dry run
  // ---------------------------------------------------------------------------

  /**
   * Runs the full resolution pipeline without writing anything.
   * Calls `onRecord` for each campaign/elected-office so the caller can
   * stream results to a file in real time.
   */
  async dryRun(onRecord: (record: BackfillDryRunRecord) => void): Promise<{
    campaignStats: Record<string, number>
    eoStats: Record<string, number>
  }> {
    this.logger.info('[organization backfill] Starting dry run')

    const campaignStats = OrganizationsBackfillService.newCategoryCounts()
    let campaignCursor: number | undefined
    let campaignsProcessed = 0

    while (true) {
      const campaigns = await this.client.campaign.findMany({
        take: OrganizationsBackfillService.BATCH_SIZE,
        ...(campaignCursor ? { skip: 1, cursor: { id: campaignCursor } } : {}),
        orderBy: { id: 'asc' },
      })

      if (campaigns.length === 0) break

      for (const campaign of campaigns) {
        const record = await this.dryRunCampaign(campaign)
        campaignStats[record.resolved?.category ?? 'error']++
        onRecord(record)
      }

      campaignsProcessed += campaigns.length
      campaignCursor = campaigns[campaigns.length - 1].id
      this.logger.info(
        { processed: campaignsProcessed },
        '[organization backfill] Dry run campaign progress',
      )
    }

    const eoStats = OrganizationsBackfillService.newCategoryCounts()
    let eoCursor: string | undefined
    let eosProcessed = 0

    while (true) {
      const electedOffices = await this.client.electedOffice.findMany({
        take: OrganizationsBackfillService.BATCH_SIZE,
        ...(eoCursor ? { skip: 1, cursor: { id: eoCursor } } : {}),
        orderBy: { id: 'asc' },
        include: { campaign: true },
      })

      if (electedOffices.length === 0) break

      for (const eo of electedOffices) {
        const { campaign } = eo
        if (!campaign) {
          eoStats['error']++
          onRecord({
            type: 'elected-office',
            id: eo.id,
            slug: OrganizationsService.electedOfficeOrgSlug(eo.id),
            userId: eo.userId,
            existingOrg: null,
            resolved: null,
            wouldWrite: false,
            wouldCreate: false,
            wouldLinkRecord: false,
            inputFields: null,
            error: 'Elected office has no linked campaign',
          })
          continue
        }
        const record = await this.dryRunElectedOffice({ ...eo, campaign })
        eoStats[record.resolved?.category ?? 'error']++
        onRecord(record)
      }

      eosProcessed += electedOffices.length
      eoCursor = electedOffices[electedOffices.length - 1].id
      this.logger.info(
        { processed: eosProcessed },
        '[organization backfill] Dry run elected office progress',
      )
    }

    this.logger.info(
      { campaignStats, eoStats },
      '[organization backfill] Dry run complete',
    )
    return { campaignStats, eoStats }
  }

  private async dryRunCampaign(
    campaign: Campaign,
  ): Promise<BackfillDryRunRecord> {
    const slug = OrganizationsService.campaignOrgSlug(campaign.id)
    const fields = this.extractCampaignFields(campaign)

    try {
      const existing = await this.model.findUnique({ where: { slug } })
      if (existing?.positionId || existing?.overrideDistrictId) {
        return {
          type: 'campaign',
          id: campaign.id,
          slug,
          userId: campaign.userId,
          existingOrg: {
            positionId: existing.positionId,
            overrideDistrictId: existing.overrideDistrictId,
            customPositionName: existing.customPositionName,
          },
          resolved: {
            positionId: null,
            overrideDistrictId: null,
            customPositionName: null,
            category: BackfillCategory.SKIPPED_ALREADY_POPULATED,
          },
          wouldWrite: false,
          wouldCreate: false,
          wouldLinkRecord: false,
          inputFields: fields,
        }
      }

      const result = await this.resolvePositionAndDistrict(campaign)
      const wouldCreate = !existing
      const wouldLinkRecord = campaign.organizationSlug !== slug

      return {
        type: 'campaign',
        id: campaign.id,
        slug,
        userId: campaign.userId,
        existingOrg: existing
          ? {
              positionId: existing.positionId,
              overrideDistrictId: existing.overrideDistrictId,
              customPositionName: existing.customPositionName,
            }
          : null,
        resolved: result,
        wouldWrite: true,
        wouldCreate,
        wouldLinkRecord,
        inputFields: fields,
      }
    } catch (e) {
      return {
        type: 'campaign',
        id: campaign.id,
        slug,
        userId: campaign.userId,
        existingOrg: null,
        resolved: null,
        wouldWrite: false,
        wouldCreate: false,
        wouldLinkRecord: false,
        inputFields: fields,
        error: e instanceof Error ? e.message : String(e),
      }
    }
  }

  private async dryRunElectedOffice(
    eo: ElectedOffice & { campaign: Campaign },
  ): Promise<BackfillDryRunRecord> {
    const slug = OrganizationsService.electedOfficeOrgSlug(eo.id)
    const fields = this.extractCampaignFields(eo.campaign)

    try {
      const existing = await this.model.findUnique({ where: { slug } })
      if (existing?.positionId || existing?.overrideDistrictId) {
        return {
          type: 'elected-office',
          id: eo.id,
          slug,
          userId: eo.userId,
          existingOrg: {
            positionId: existing.positionId,
            overrideDistrictId: existing.overrideDistrictId,
            customPositionName: existing.customPositionName,
          },
          resolved: {
            positionId: null,
            overrideDistrictId: null,
            customPositionName: null,
            category: BackfillCategory.SKIPPED_ALREADY_POPULATED,
          },
          wouldWrite: false,
          wouldCreate: false,
          wouldLinkRecord: false,
          inputFields: fields,
        }
      }

      const result = await this.resolvePositionAndDistrict(eo.campaign)
      const wouldCreate = !existing
      const wouldLinkRecord = eo.organizationSlug !== slug

      return {
        type: 'elected-office',
        id: eo.id,
        slug,
        userId: eo.userId,
        existingOrg: existing
          ? {
              positionId: existing.positionId,
              overrideDistrictId: existing.overrideDistrictId,
              customPositionName: existing.customPositionName,
            }
          : null,
        resolved: result,
        wouldWrite: true,
        wouldCreate,
        wouldLinkRecord,
        inputFields: fields,
      }
    } catch (e) {
      return {
        type: 'elected-office',
        id: eo.id,
        slug,
        userId: eo.userId,
        existingOrg: null,
        resolved: null,
        wouldWrite: false,
        wouldCreate: false,
        wouldLinkRecord: false,
        inputFields: fields,
        error: e instanceof Error ? e.message : String(e),
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Campaign backfill
  // ---------------------------------------------------------------------------

  /**
   * Paginates through all campaigns using cursor-based batching and
   * creates/updates an Organization for each one.
   */
  private async backfillCampaignOrganizations() {
    const categoryCounts = OrganizationsBackfillService.newCategoryCounts()
    let cursor: number | undefined
    let processed = 0

    while (true) {
      const campaigns = await this.client.campaign.findMany({
        take: OrganizationsBackfillService.BATCH_SIZE,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        orderBy: { id: 'asc' },
      })

      if (campaigns.length === 0) break

      for (const campaign of campaigns) {
        const category = await this.backfillCampaignOrganization(campaign)
        categoryCounts[category]++
      }

      processed += campaigns.length
      cursor = campaigns[campaigns.length - 1].id
      this.logger.info(
        { processed },
        '[organization backfill] Campaign organization backfill progress',
      )
    }

    return categoryCounts
  }

  /**
   * Processes a single campaign:
   * 1. Skip if its org already has position/district data.
   * 2. Resolve position + district from the election-api.
   * 3. Upsert the Organization row.
   * 4. Link the campaign to the org if not already linked.
   *
   * Errors are caught and logged so one bad campaign doesn't halt the batch.
   */
  private async backfillCampaignOrganization(
    campaign: Campaign,
  ): Promise<string> {
    const slug = OrganizationsService.campaignOrgSlug(campaign.id)
    const logCtx = { campaignId: campaign.id, slug }

    // Always ensure the org exists and the campaign is linked, even if
    // resolution fails — so every campaign has an organization row.
    await this.model.upsert({
      where: { slug },
      update: {},
      create: { slug, ownerId: campaign.userId },
    })

    if (campaign.organizationSlug !== slug) {
      await this.client.campaign.update({
        where: { id: campaign.id },
        data: { organizationSlug: slug },
      })
    }

    // Skip if the org already has data — no need to re-resolve.
    const existing = await this.model.findUnique({ where: { slug } })
    if (existing?.positionId || existing?.overrideDistrictId) {
      return BackfillCategory.SKIPPED_ALREADY_POPULATED
    }

    try {
      const result = await this.resolvePositionAndDistrict(campaign)

      this.logger.info(
        { ...logCtx, ...result },
        '[organization backfill] Resolved campaign organization',
      )

      await this.model.update({
        where: { slug },
        data: {
          positionId: result.positionId,
          overrideDistrictId: result.overrideDistrictId,
          customPositionName: result.customPositionName,
        },
      })

      return result.category
    } catch (e) {
      // Log and continue — don't let one campaign break the whole backfill.
      const fields = this.extractCampaignFields(campaign)
      this.logger.error(
        {
          ...logCtx,
          error: e,
          ballotReadyPositionId: fields.ballotReadyPositionId,
          state: fields.state,
          L2DistrictType: fields.L2DistrictType,
          L2DistrictName: fields.L2DistrictName,
        },
        '[organization backfill] Failed to backfill campaign organization',
      )
      return 'error'
    }
  }

  // ---------------------------------------------------------------------------
  // Elected office backfill
  // ---------------------------------------------------------------------------

  /**
   * Same cursor-based batching as campaigns, but for ElectedOffices.
   * Each elected office gets its own Organization, using its linked
   * campaign's data to resolve position/district.
   */
  private async backfillElectedOfficeOrganizations() {
    const categoryCounts = OrganizationsBackfillService.newCategoryCounts()
    let cursor: string | undefined
    let processed = 0

    while (true) {
      const electedOffices = await this.client.electedOffice.findMany({
        take: OrganizationsBackfillService.BATCH_SIZE,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        orderBy: { id: 'asc' },
        include: { campaign: true },
      })

      if (electedOffices.length === 0) break

      for (const eo of electedOffices) {
        const { campaign } = eo
        if (!campaign) {
          this.logger.info(
            { electedOfficeId: eo.id },
            '[organization backfill] Elected office has no linked campaign, skipping',
          )
          categoryCounts['error']++
          continue
        }
        const category = await this.backfillElectedOfficeOrganization({
          ...eo,
          campaign,
        })
        categoryCounts[category]++
      }

      processed += electedOffices.length
      cursor = electedOffices[electedOffices.length - 1].id
      this.logger.info(
        { processed },
        '[organization backfill] Elected office organization backfill progress',
      )
    }

    return categoryCounts
  }

  /**
   * Processes a single elected office — same pattern as campaign backfill,
   * but uses the elected office's linked campaign for position/district data.
   */
  private async backfillElectedOfficeOrganization(
    eo: ElectedOffice & { campaign: Campaign },
  ): Promise<string> {
    const slug = OrganizationsService.electedOfficeOrgSlug(eo.id)
    const logCtx = {
      electedOfficeId: eo.id,
      campaignId: eo.campaignId,
      slug,
    }

    // Always ensure the org exists and the EO is linked, even if
    // resolution fails — so every elected office has an organization row.
    await this.model.upsert({
      where: { slug },
      update: {},
      create: { slug, ownerId: eo.userId },
    })

    if (eo.organizationSlug !== slug) {
      await this.client.electedOffice.update({
        where: { id: eo.id },
        data: { organizationSlug: slug },
      })
    }

    const existing = await this.model.findUnique({ where: { slug } })
    if (existing?.positionId || existing?.overrideDistrictId) {
      return BackfillCategory.SKIPPED_ALREADY_POPULATED
    }

    try {
      // Resolve using the elected office's campaign data.
      const result = await this.resolvePositionAndDistrict(eo.campaign)

      this.logger.info(
        { ...logCtx, ...result },
        '[organization backfill] Resolved elected office organization',
      )

      await this.model.update({
        where: { slug },
        data: {
          positionId: result.positionId,
          overrideDistrictId: result.overrideDistrictId,
          customPositionName: result.customPositionName,
        },
      })

      return result.category
    } catch (e) {
      const fields = this.extractCampaignFields(eo.campaign)
      this.logger.error(
        {
          ...logCtx,
          error: e,
          ballotReadyPositionId: fields.ballotReadyPositionId,
          state: fields.state,
          L2DistrictType: fields.L2DistrictType,
          L2DistrictName: fields.L2DistrictName,
        },
        '[organization backfill] Failed to backfill elected office organization',
      )
      return 'error'
    }
  }

  // ---------------------------------------------------------------------------
  // Position & district resolution
  // ---------------------------------------------------------------------------

  /** Type guard: true if value is a plain object (not null, not array). */
  private static isJsonObject(
    value: unknown,
  ): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
  }

  /** Safely reads a string from a JSON object; returns '' for missing/non-string values. */
  private static getString(obj: Record<string, unknown>, key: string): string {
    const val = obj[key]
    return typeof val === 'string' ? val : ''
  }

  /**
   * Defensively extracts fields from campaign.details.
   *
   * These are JSON columns, so the data shape is not guaranteed by Prisma.
   * We validate that details is an object and safely extract all fields with
   * getString() which returns '' for missing/non-string values. A non-string
   * positionId is treated as absent (null) rather than an error, so the
   * resolution logic can still fall through to district-only lookup.
   *
   * Returns an error string only if details itself is not an object (nothing
   * to extract), otherwise error is null.
   */
  extractCampaignFields(campaign: Campaign): {
    error: string | null
    state: string
    ballotReadyPositionId: string | null
    L2DistrictType: string
    L2DistrictName: string
    office: string
    otherOffice: string
  } {
    const { isJsonObject, getString } = OrganizationsBackfillService
    const C = BackfillCategory
    const details = campaign.details as PrismaJson.CampaignDetails | null

    if (!isJsonObject(details)) {
      return {
        error: C.INVALID_DETAILS,
        state: '',
        ballotReadyPositionId: null,
        L2DistrictType: '',
        L2DistrictName: '',
        office: '',
        otherOffice: '',
      }
    }

    return {
      error: null,
      state: getString(details, 'state'),
      // Historical data may still have positionId on campaign.details
      // before the org migration.
      ballotReadyPositionId: getString(details, 'positionId') || null,
      L2DistrictType: '',
      L2DistrictName: '',
      office: getString(details, 'office'),
      otherOffice: getString(details, 'otherOffice'),
    }
  }

  /**
   * Core resolution logic. Determines the best positionId, overrideDistrictId,
   * and customPositionName for an organization based on the campaign's data.
   *
   * Resolution priority (falls through on failure):
   *
   * 1. **Has BallotReady positionId** → look up in election-api
   *    a. Position found with district, district matches p2v → EXACT_MATCH
   *    b. Position found with district, district differs → look up override district
   *    c. Position found with district, but no p2v data to override → POSITION_ONLY_MISSING_P2V_DISTRICT
   *    d. Position found but no district on it → POSITION_ONLY_NO_DISTRICT_ON_POSITION
   *    e. Position not found → fall through to step 2
   *
   * 2. **No position (or not found)** → try district-only lookup using p2v data
   *    a. District found → DISTRICT_ONLY
   *    b. District not found → DISTRICT_NOT_FOUND
   *
   * 3. **No data at all** → NO_DATA
   *
   * customPositionName is set only when positionId is null (i.e. the office
   * name won't come from the election-api, so we store the campaign's own
   * office name). See OrganizationsService.resolveCustomPositionName for the
   * office/otherOffice resolution logic.
   */
  private async resolvePositionAndDistrict(campaign: Campaign): Promise<{
    positionId: string | null
    overrideDistrictId: string | null
    customPositionName: string | null
    category: string
  }> {
    const C = BackfillCategory
    const fields = this.extractCampaignFields(campaign)

    // Malformed data — still compute customPositionName from whatever we got.
    if (fields.error) {
      this.logger.warn(
        {
          campaignId: campaign.id,
          category: fields.error,
          details: campaign.details,
        },
        `[organization backfill] Campaign has ${fields.error}`,
      )
      return {
        positionId: null,
        overrideDistrictId: null,
        customPositionName: OrganizationsService.resolveCustomPositionName(
          fields.office,
          fields.otherOffice,
        ),
        category: fields.error,
      }
    }

    const {
      state,
      ballotReadyPositionId,
      L2DistrictType,
      L2DistrictName,
      office,
      otherOffice,
    } = fields
    // Pre-compute: only used when positionId ends up null (custom office).
    const customPositionName = OrganizationsService.resolveCustomPositionName(
      office,
      otherOffice,
    )

    // --- Step 1: Try to resolve via BallotReady position ID ---
    if (ballotReadyPositionId) {
      const position = await this.electionsService.getPositionByBallotReadyId(
        ballotReadyPositionId,
        { includeDistrict: true },
      )

      if (!position) {
        this.logger.warn(
          { campaignId: campaign.id, ballotReadyPositionId },
          '[organization backfill] Position not found in election-api for ballotReady ID',
        )
        return {
          positionId: null,
          overrideDistrictId: null,
          customPositionName,
          category: C.POSITION_NOT_FOUND,
        }
      }

      // 1a-c: Position has a district — compare with p2v data.
      if (position?.district) {
        // 1c: Position has a district but we lack p2v data to find the override.
        if (!state || !L2DistrictType || !L2DistrictName) {
          return {
            positionId: position.id,
            overrideDistrictId: null,
            customPositionName: null,
            category: C.POSITION_ONLY_MISSING_P2V_DISTRICT,
          }
        }

        // 1a: Check if the district matches exactly (no override needed).
        const cleanedName =
          this.electionsService.cleanDistrictName(L2DistrictName)
        const isExactMatch =
          position.district.L2DistrictType === L2DistrictType &&
          position.district.L2DistrictName === cleanedName

        if (isExactMatch) {
          return {
            positionId: position.id,
            overrideDistrictId: null,
            customPositionName: null,
            category: C.EXACT_MATCH,
          }
        }

        // 1b: District differs — look up the override district.
        let overrideDistrictId: string | null = null
        try {
          overrideDistrictId = await this.electionsService.getDistrictId(
            state,
            L2DistrictType,
            L2DistrictName,
          )
        } catch (err) {
          this.logger.warn(
            { campaignId: campaign.id, state, L2DistrictType, L2DistrictName },
            `[organization backfill] Override district lookup failed: ${err instanceof Error ? err.message : err}`,
          )
        }

        return {
          positionId: position.id,
          overrideDistrictId,
          customPositionName: null,
          category: overrideDistrictId
            ? C.OVERRIDE_DISTRICT
            : C.DISTRICT_NOT_FOUND,
        }
      }

      // 1d: Position exists but has no district on it at all.
      if (position) {
        return {
          positionId: position.id,
          overrideDistrictId: null,
          customPositionName: null,
          category: C.POSITION_ONLY_NO_DISTRICT_ON_POSITION,
        }
      }
    }

    // --- Step 2: No position — try district-only lookup from p2v data ---
    if (state && L2DistrictType && L2DistrictName) {
      let districtId: string | null = null
      try {
        districtId = await this.organizationsService.resolveOverrideDistrictId({
          state,
          L2DistrictType,
          L2DistrictName,
        })
      } catch (err) {
        this.logger.warn(
          { campaignId: campaign.id, state, L2DistrictType, L2DistrictName },
          `[organization backfill] District lookup failed (no position fallback): ${err instanceof Error ? err.message : err}`,
        )
      }
      if (!districtId) {
        this.logger.warn(
          { campaignId: campaign.id, state, L2DistrictType, L2DistrictName },
          '[organization backfill] District lookup returned null (no position fallback)',
        )
      }
      return {
        positionId: null,
        overrideDistrictId: districtId,
        customPositionName,
        category: districtId ? C.DISTRICT_ONLY : C.DISTRICT_NOT_FOUND,
      }
    }

    // --- Step 3: No data at all ---
    return {
      positionId: null,
      overrideDistrictId: null,
      customPositionName,
      category: C.NO_DATA,
    }
  }
}
