import { ElectionsService } from '@/elections/services/elections.service'
import { useTestService } from '@/test-service'
import { describe, expect, it, vi } from 'vitest'
import {
  BackfillDryRunRecord,
  OrganizationsBackfillService,
} from './organizations-backfill.service'

const service = useTestService()

describe('OrganizationsBackfillService', () => {
  it('creates organization for campaign with exact position match', async () => {
    const electionsService = service.app.get(ElectionsService)
    vi.spyOn(electionsService, 'getPositionByBallotReadyId').mockResolvedValue({
      id: 'election-api-pos-id',
      brPositionId: 'br-pos-1',
      brDatabaseId: 'br-db-1',
      state: 'CA',
      name: 'Mayor',
      district: {
        id: 'district-uuid-1',
        L2DistrictType: 'City',
        L2DistrictName: 'Los Angeles',
        projectedTurnout: null,
      },
    })

    const campaign = await service.prisma.campaign.create({
      data: {
        userId: service.user.id,
        slug: 'test-exact-match',
        details: { positionId: 'br-pos-1', state: 'CA' },
      },
    })

    await service.prisma.pathToVictory.create({
      data: {
        campaignId: campaign.id,
        data: { electionType: 'City', electionLocation: 'Los Angeles' },
      },
    })

    // Trigger backfill manually
    const backfillService = service.app.get(OrganizationsBackfillService)
    await backfillService['backfillOrganizations']()

    const org = await service.prisma.organization.findUnique({
      where: { slug: `campaign-${campaign.id}` },
    })

    expect(org).toMatchObject({
      positionId: 'election-api-pos-id',
      overrideDistrictId: null,
      customPositionName: null,
      ownerId: service.user.id,
    })

    // Verify campaign is linked to the organization
    const updatedCampaign = await service.prisma.campaign.findUnique({
      where: { id: campaign.id },
    })
    expect(updatedCampaign?.organizationSlug).toBe(`campaign-${campaign.id}`)
  })

  it('creates organization with override when district does not match', async () => {
    const electionsService = service.app.get(ElectionsService)
    vi.spyOn(electionsService, 'getPositionByBallotReadyId').mockResolvedValue({
      id: 'election-api-pos-id-2',
      brPositionId: 'br-pos-2',
      brDatabaseId: 'br-db-2',
      state: 'CA',
      name: 'City Council',
      district: {
        id: 'district-uuid-original',
        L2DistrictType: 'City Council',
        L2DistrictName: 'District 1',
        projectedTurnout: null,
      },
    })
    vi.spyOn(electionsService, 'getDistrictId').mockResolvedValue(
      'override-district-uuid',
    )

    const campaign = await service.prisma.campaign.create({
      data: {
        userId: service.user.id,
        slug: 'test-override',
        details: { positionId: 'br-pos-2', state: 'CA' },
      },
    })

    await service.prisma.pathToVictory.create({
      data: {
        campaignId: campaign.id,
        data: {
          electionType: 'City Council',
          electionLocation: 'District 5',
        },
      },
    })

    const backfillService = service.app.get(OrganizationsBackfillService)
    await backfillService['backfillOrganizations']()

    const org = await service.prisma.organization.findUnique({
      where: { slug: `campaign-${campaign.id}` },
    })

    expect(org).toMatchObject({
      positionId: 'election-api-pos-id-2',
      overrideDistrictId: 'override-district-uuid',
      customPositionName: null,
      ownerId: service.user.id,
    })
  })

  it('categorises as district_not_found when district differs but getDistrictId returns null', async () => {
    const electionsService = service.app.get(ElectionsService)
    vi.spyOn(electionsService, 'getPositionByBallotReadyId').mockResolvedValue({
      id: 'election-api-pos-id-3',
      brPositionId: 'br-pos-3',
      brDatabaseId: 'br-db-3',
      state: 'CA',
      name: 'City Council',
      district: {
        id: 'district-uuid-original',
        L2DistrictType: 'City Council',
        L2DistrictName: 'District 1',
        projectedTurnout: null,
      },
    })
    vi.spyOn(electionsService, 'getDistrictId').mockResolvedValue(null)

    const campaign = await service.prisma.campaign.create({
      data: {
        userId: service.user.id,
        slug: 'test-district-not-found',
        details: { positionId: 'br-pos-3', state: 'CA' },
      },
    })

    await service.prisma.pathToVictory.create({
      data: {
        campaignId: campaign.id,
        data: {
          electionType: 'City Council',
          electionLocation: 'District 99',
        },
      },
    })

    const backfillService = service.app.get(OrganizationsBackfillService)
    const stats = await backfillService['backfillCampaignOrganizations']()

    // Verify the category is district_not_found, NOT exact_match
    expect(stats.district_not_found).toBe(1)
    expect(stats.exact_match).toBe(0)

    const org = await service.prisma.organization.findUnique({
      where: { slug: `campaign-${campaign.id}` },
    })

    expect(org).toMatchObject({
      positionId: 'election-api-pos-id-3',
      overrideDistrictId: null,
      customPositionName: null,
      ownerId: service.user.id,
    })
  })

  it('creates organization with district only when no position found', async () => {
    const electionsService = service.app.get(ElectionsService)
    vi.spyOn(electionsService, 'getPositionByBallotReadyId').mockResolvedValue(
      null,
    )
    vi.spyOn(electionsService, 'getDistrictId').mockResolvedValue(
      'fallback-district-uuid',
    )

    const campaign = await service.prisma.campaign.create({
      data: {
        userId: service.user.id,
        slug: 'test-no-position',
        details: { state: 'NY' },
      },
    })

    await service.prisma.pathToVictory.create({
      data: {
        campaignId: campaign.id,
        data: {
          electionType: 'State Senate',
          electionLocation: 'District 10',
        },
      },
    })

    const backfillService = service.app.get(OrganizationsBackfillService)
    await backfillService['backfillOrganizations']()

    const org = await service.prisma.organization.findUnique({
      where: { slug: `campaign-${campaign.id}` },
    })

    expect(org).toMatchObject({
      positionId: null,
      overrideDistrictId: 'fallback-district-uuid',
      customPositionName: null,
      ownerId: service.user.id,
    })
  })

  it('returns nulls when no position and no district data', async () => {
    const campaign = await service.prisma.campaign.create({
      data: {
        userId: service.user.id,
        slug: 'test-no-data',
        details: {},
      },
    })

    const backfillService = service.app.get(OrganizationsBackfillService)
    await backfillService['backfillOrganizations']()

    const org = await service.prisma.organization.findUnique({
      where: { slug: `campaign-${campaign.id}` },
    })

    expect(org).toMatchObject({
      positionId: null,
      overrideDistrictId: null,
      customPositionName: null,
      ownerId: service.user.id,
    })
  })

  it('skips organizations that already have positionId populated', async () => {
    const electionsService = service.app.get(ElectionsService)
    const spy = vi.spyOn(electionsService, 'getPositionByBallotReadyId')

    const campaign = await service.prisma.campaign.create({
      data: {
        userId: service.user.id,
        slug: 'test-skip-existing',
        details: { positionId: 'br-pos-skip', state: 'CA' },
      },
    })

    await service.prisma.organization.create({
      data: {
        slug: `campaign-${campaign.id}`,
        ownerId: service.user.id,
        positionId: 'already-set',
      },
    })

    const backfillService = service.app.get(OrganizationsBackfillService)
    await backfillService['backfillOrganizations']()

    // Should not have called election API for this campaign
    expect(spy).not.toHaveBeenCalled()

    const org = await service.prisma.organization.findUnique({
      where: { slug: `campaign-${campaign.id}` },
    })
    expect(org?.positionId).toBe('already-set')
  })

  it('skips organizations that already have overrideDistrictId populated', async () => {
    const electionsService = service.app.get(ElectionsService)
    const spy = vi.spyOn(electionsService, 'getPositionByBallotReadyId')

    const campaign = await service.prisma.campaign.create({
      data: {
        userId: service.user.id,
        slug: 'test-skip-override',
        details: { state: 'TX' },
      },
    })

    await service.prisma.organization.create({
      data: {
        slug: `campaign-${campaign.id}`,
        ownerId: service.user.id,
        overrideDistrictId: 'already-set-district',
      },
    })

    const backfillService = service.app.get(OrganizationsBackfillService)
    await backfillService['backfillOrganizations']()

    expect(spy).not.toHaveBeenCalled()

    const org = await service.prisma.organization.findUnique({
      where: { slug: `campaign-${campaign.id}` },
    })
    expect(org?.overrideDistrictId).toBe('already-set-district')
  })

  it('creates organization for elected office using campaign district data', async () => {
    const electionsService = service.app.get(ElectionsService)
    vi.spyOn(electionsService, 'getPositionByBallotReadyId').mockResolvedValue({
      id: 'eo-position-id',
      brPositionId: 'br-pos-eo',
      brDatabaseId: 'br-db-eo',
      state: 'FL',
      name: 'School Board',
      district: {
        id: 'eo-district-id',
        L2DistrictType: 'School Board',
        L2DistrictName: 'District A',
        projectedTurnout: null,
      },
    })

    const campaign = await service.prisma.campaign.create({
      data: {
        userId: service.user.id,
        slug: 'test-eo-campaign',
        details: { positionId: 'br-pos-eo', state: 'FL' },
      },
    })

    // Create campaign org so it doesn't conflict
    await service.prisma.organization.create({
      data: {
        slug: `campaign-${campaign.id}`,
        ownerId: service.user.id,
        positionId: 'eo-position-id',
      },
    })

    await service.prisma.pathToVictory.create({
      data: {
        campaignId: campaign.id,
        data: {
          electionType: 'School Board',
          electionLocation: 'District A',
        },
      },
    })

    const eo = await service.prisma.electedOffice.create({
      data: {
        userId: service.user.id,
        campaignId: campaign.id,
      },
    })

    const backfillService = service.app.get(OrganizationsBackfillService)
    await backfillService['backfillOrganizations']()

    const eoOrg = await service.prisma.organization.findUnique({
      where: { slug: `eo-${eo.id}` },
    })

    expect(eoOrg).toMatchObject({
      positionId: 'eo-position-id',
      overrideDistrictId: null,
      customPositionName: null,
      ownerId: service.user.id,
    })

    // Verify elected office is linked to the organization
    const updatedEo = await service.prisma.electedOffice.findUnique({
      where: { id: eo.id },
    })
    expect(updatedEo?.organizationSlug).toBe(`eo-${eo.id}`)
  })

  it('continues processing when individual campaign fails', async () => {
    const electionsService = service.app.get(ElectionsService)
    vi.spyOn(
      electionsService,
      'getPositionByBallotReadyId',
    ).mockRejectedValueOnce(new Error('Election API down'))

    vi.spyOn(electionsService, 'getDistrictId').mockResolvedValue(
      'district-for-second',
    )

    // First campaign will fail (position lookup throws)
    const campaign1 = await service.prisma.campaign.create({
      data: {
        userId: service.user.id,
        slug: 'test-fail-first',
        details: { positionId: 'br-pos-fail', state: 'CA' },
      },
    })

    await service.prisma.pathToVictory.create({
      data: {
        campaignId: campaign1.id,
        data: { electionType: 'City', electionLocation: 'Test City' },
      },
    })

    // Second campaign should still succeed (no positionId, falls back to district lookup)
    const campaign2 = await service.prisma.campaign.create({
      data: {
        userId: service.user.id,
        slug: 'test-succeed-second',
        details: { state: 'NY' },
      },
    })

    await service.prisma.pathToVictory.create({
      data: {
        campaignId: campaign2.id,
        data: {
          electionType: 'State Senate',
          electionLocation: 'District 1',
        },
      },
    })

    const backfillService = service.app.get(OrganizationsBackfillService)
    await backfillService['backfillOrganizations']()

    // First campaign should have an empty org (created before resolution failed)
    const org1 = await service.prisma.organization.findUnique({
      where: { slug: `campaign-${campaign1.id}` },
    })
    expect(org1).toMatchObject({
      positionId: null,
      overrideDistrictId: null,
      customPositionName: null,
    })

    // Second campaign should have an org
    const org2 = await service.prisma.organization.findUnique({
      where: { slug: `campaign-${campaign2.id}` },
    })
    expect(org2).toMatchObject({
      positionId: null,
      overrideDistrictId: 'district-for-second',
      customPositionName: null,
    })
  })

  it('handles campaign with non-object details gracefully', async () => {
    const campaign = await service.prisma.campaign.create({
      data: {
        userId: service.user.id,
        slug: 'test-bad-details',
        // Prisma JSON column accepts any JSON value; simulate old data
        details: 'some-string-value' as unknown as Record<string, unknown>,
      },
    })

    const backfillService = service.app.get(OrganizationsBackfillService)
    await backfillService['backfillOrganizations']()

    const org = await service.prisma.organization.findUnique({
      where: { slug: `campaign-${campaign.id}` },
    })

    // Org should still be created, but with null values
    expect(org).toMatchObject({
      positionId: null,
      overrideDistrictId: null,
      customPositionName: null,
      ownerId: service.user.id,
    })
  })

  it('handles campaign with non-string positionId gracefully', async () => {
    const campaign = await service.prisma.campaign.create({
      data: {
        userId: service.user.id,
        slug: 'test-numeric-posid',
        details: { positionId: 12345, state: 'CA' } as unknown as Record<
          string,
          unknown
        >,
      },
    })

    const backfillService = service.app.get(OrganizationsBackfillService)
    await backfillService['backfillOrganizations']()

    const org = await service.prisma.organization.findUnique({
      where: { slug: `campaign-${campaign.id}` },
    })

    expect(org).toMatchObject({
      positionId: null,
      overrideDistrictId: null,
      customPositionName: null,
      ownerId: service.user.id,
    })
  })

  it('handles campaign with no pathToVictory record', async () => {
    vi.spyOn(
      service.app.get(ElectionsService),
      'getPositionByBallotReadyId',
    ).mockResolvedValue(null)

    const campaign = await service.prisma.campaign.create({
      data: {
        userId: service.user.id,
        slug: 'test-no-p2v',
        details: { positionId: 'br-pos-no-p2v', state: 'CA' },
      },
    })
    // No pathToVictory created

    const backfillService = service.app.get(OrganizationsBackfillService)
    await backfillService['backfillOrganizations']()

    const org = await service.prisma.organization.findUnique({
      where: { slug: `campaign-${campaign.id}` },
    })

    // Org created with nulls since position not found and no p2v district data
    expect(org).toMatchObject({
      positionId: null,
      overrideDistrictId: null,
      customPositionName: null,
      ownerId: service.user.id,
    })
  })

  it('handles position found but no district linked', async () => {
    const electionsService = service.app.get(ElectionsService)
    vi.spyOn(electionsService, 'getPositionByBallotReadyId').mockResolvedValue({
      id: 'pos-no-district',
      brPositionId: 'br-pos-no-dist',
      brDatabaseId: 'br-db-no-dist',
      state: 'CA',
      name: 'Treasurer',
    })

    const campaign = await service.prisma.campaign.create({
      data: {
        userId: service.user.id,
        slug: 'test-pos-no-district',
        details: { positionId: 'br-pos-no-dist', state: 'CA' },
      },
    })

    await service.prisma.pathToVictory.create({
      data: {
        campaignId: campaign.id,
        data: { electionType: 'County', electionLocation: 'Test County' },
      },
    })

    const backfillService = service.app.get(OrganizationsBackfillService)
    await backfillService['backfillOrganizations']()

    const org = await service.prisma.organization.findUnique({
      where: { slug: `campaign-${campaign.id}` },
    })

    expect(org).toMatchObject({
      positionId: 'pos-no-district',
      overrideDistrictId: null,
      customPositionName: null,
    })
  })

  it('sets customPositionName for custom office when no position found', async () => {
    const electionsService = service.app.get(ElectionsService)
    vi.spyOn(electionsService, 'getPositionByBallotReadyId').mockResolvedValue(
      null,
    )
    vi.spyOn(electionsService, 'getDistrictId').mockResolvedValue(
      'custom-district-uuid',
    )

    const campaign = await service.prisma.campaign.create({
      data: {
        userId: service.user.id,
        slug: 'test-custom-office',
        details: { office: 'City Assessor', state: 'CA' },
      },
    })

    await service.prisma.pathToVictory.create({
      data: {
        campaignId: campaign.id,
        data: {
          electionType: 'City',
          electionLocation: 'Test City',
        },
      },
    })

    const backfillService = service.app.get(OrganizationsBackfillService)
    await backfillService['backfillOrganizations']()

    const org = await service.prisma.organization.findUnique({
      where: { slug: `campaign-${campaign.id}` },
    })

    expect(org).toMatchObject({
      positionId: null,
      customPositionName: 'City Assessor',
      ownerId: service.user.id,
    })
  })

  describe('dryRun', () => {
    it('never writes to the database', async () => {
      const electionsService = service.app.get(ElectionsService)
      vi.spyOn(
        electionsService,
        'getPositionByBallotReadyId',
      ).mockResolvedValue({
        id: 'dry-run-pos',
        brPositionId: 'br-dry',
        brDatabaseId: 'br-db-dry',
        state: 'CA',
        name: 'Mayor',
        district: {
          id: 'dry-district',
          L2DistrictType: 'City',
          L2DistrictName: 'Test City',
          projectedTurnout: null,
        },
      })

      const campaign = await service.prisma.campaign.create({
        data: {
          userId: service.user.id,
          slug: 'test-dry-run',
          details: { positionId: 'br-dry', state: 'CA' },
        },
      })

      await service.prisma.pathToVictory.create({
        data: {
          campaignId: campaign.id,
          data: { electionType: 'City', electionLocation: 'Test City' },
        },
      })

      // Also create an elected office to test both code paths
      const eo = await service.prisma.electedOffice.create({
        data: {
          userId: service.user.id,
          campaignId: campaign.id,
        },
      })

      // Snapshot database state before dry run
      const orgCountBefore = await service.prisma.organization.count()
      const campaignBefore = await service.prisma.campaign.findUnique({
        where: { id: campaign.id },
      })
      const eoBefore = await service.prisma.electedOffice.findUnique({
        where: { id: eo.id },
      })

      const backfillService = service.app.get(OrganizationsBackfillService)

      const records: BackfillDryRunRecord[] = []
      const { campaignStats, eoStats } = await backfillService.dryRun(
        (record) => {
          records.push(record)
        },
      )

      // --- Verify NO database writes occurred ---

      // No organizations were created
      const orgCountAfter = await service.prisma.organization.count()
      expect(orgCountAfter).toBe(orgCountBefore)

      // No org exists for the test campaign or elected office
      const campaignOrg = await service.prisma.organization.findUnique({
        where: { slug: `campaign-${campaign.id}` },
      })
      expect(campaignOrg).toBeNull()

      const eoOrg = await service.prisma.organization.findUnique({
        where: { slug: `eo-${eo.id}` },
      })
      expect(eoOrg).toBeNull()

      // Campaign and EO organizationSlug were not updated
      const campaignAfter = await service.prisma.campaign.findUnique({
        where: { id: campaign.id },
      })
      expect(campaignAfter!.organizationSlug).toBe(
        campaignBefore!.organizationSlug,
      )

      const eoAfter = await service.prisma.electedOffice.findUnique({
        where: { id: eo.id },
      })
      expect(eoAfter!.organizationSlug).toBe(eoBefore!.organizationSlug)

      // --- Verify records were emitted with correct resolution ---
      expect(records.length).toBeGreaterThan(0)

      const campaignRecord = records.find(
        (r) => r.type === 'campaign' && r.id === campaign.id,
      )
      expect(campaignRecord).toBeDefined()
      expect(campaignRecord!.resolved?.category).toBe('exact_match')
      expect(campaignRecord!.wouldWrite).toBe(true)
      expect(campaignRecord!.wouldCreate).toBe(true)

      const eoRecord = records.find(
        (r) => r.type === 'elected-office' && r.id === eo.id,
      )
      expect(eoRecord).toBeDefined()
      expect(eoRecord!.wouldWrite).toBe(true)
      expect(eoRecord!.wouldCreate).toBe(true)

      // Stats should reflect the processed records
      expect(campaignStats.exact_match).toBeGreaterThanOrEqual(1)
      expect(
        Object.values(eoStats).reduce((a, b) => a + b, 0),
      ).toBeGreaterThanOrEqual(1)
    })
  })

  it('resolves customPositionName from otherOffice when office is "Other" and no position found', async () => {
    const electionsService = service.app.get(ElectionsService)
    vi.spyOn(electionsService, 'getPositionByBallotReadyId').mockResolvedValue(
      null,
    )
    vi.spyOn(electionsService, 'getDistrictId').mockResolvedValue(
      'other-district-uuid',
    )

    const campaign = await service.prisma.campaign.create({
      data: {
        userId: service.user.id,
        slug: 'test-other-office',
        details: {
          office: 'Other',
          otherOffice: 'Mayor',
          positionId: 'br-pos-not-found',
          state: 'NY',
        },
      },
    })

    await service.prisma.pathToVictory.create({
      data: {
        campaignId: campaign.id,
        data: {
          electionType: 'City',
          electionLocation: 'Test Town',
        },
      },
    })

    const backfillService = service.app.get(OrganizationsBackfillService)
    await backfillService['backfillOrganizations']()

    const org = await service.prisma.organization.findUnique({
      where: { slug: `campaign-${campaign.id}` },
    })

    expect(org).toMatchObject({
      positionId: null,
      customPositionName: 'Mayor',
      ownerId: service.user.id,
    })
  })
})
