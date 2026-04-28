import { useTestService } from '@/test-service'
import { ElectionsService } from '@/elections/services/elections.service'
import { describe, expect, it, vi } from 'vitest'

const service = useTestService()

describe('GET /v1/organizations', () => {
  it('returns empty list when user has no organizations', async () => {
    const result = await service.client.get('/v1/organizations')

    expect(result).toMatchObject({
      status: 200,
      data: { organizations: [] },
    })
  })

  it('returns organizations with name from campaign electionDate', async () => {
    const electionsService = service.app.get(ElectionsService)
    vi.spyOn(electionsService, 'getPositionById').mockResolvedValue({
      id: 'pos-123',
      brPositionId: 'br-pos-123',
      brDatabaseId: 'br-db-123',
      state: 'CA',
      name: 'Mayor',
    })

    await service.prisma.organization.create({
      data: {
        slug: 'campaign-1',
        ownerId: service.user.id,
        positionId: 'br-pos-123',
      },
    })

    await service.prisma.campaign.create({
      data: {
        userId: service.user.id,
        slug: 'test-campaign',
        details: { electionDate: '2026-11-03' },
        organizationSlug: 'campaign-1',
      },
    })

    const result = await service.client.get('/v1/organizations')

    expect(result).toMatchObject({
      status: 200,
      data: {
        organizations: [
          {
            slug: 'campaign-1',
            name: '2026 Campaign',
            campaignId: 1,
            electedOfficeId: null,
          },
        ],
      },
    })
  })

  it('returns "Campaign" as name when no electionDate', async () => {
    await service.prisma.organization.create({
      data: {
        slug: 'campaign-2',
        ownerId: service.user.id,
      },
    })

    await service.prisma.campaign.create({
      data: {
        userId: service.user.id,
        slug: 'test-campaign-no-pos',
        details: {},
        organizationSlug: 'campaign-2',
      },
    })

    const result = await service.client.get('/v1/organizations')

    expect(result).toMatchObject({
      status: 200,
      data: {
        organizations: [
          {
            slug: 'campaign-2',
            name: 'Campaign',
            campaignId: 2,
            electedOfficeId: null,
          },
        ],
      },
    })
  })

  it('ignores customPositionName for campaign orgs', async () => {
    await service.prisma.organization.create({
      data: {
        slug: 'campaign-3',
        ownerId: service.user.id,
        customPositionName: 'Custom Office Name',
      },
    })

    await service.prisma.campaign.create({
      data: {
        userId: service.user.id,
        slug: 'test-campaign-custom',
        details: { electionDate: '2026-11-03' },
        organizationSlug: 'campaign-3',
      },
    })

    const result = await service.client.get('/v1/organizations')

    expect(result).toMatchObject({
      status: 200,
      data: {
        organizations: [
          {
            slug: 'campaign-3',
            name: '2026 Campaign',
            positionName: 'Custom Office Name',
            campaignId: 3,
            electedOfficeId: null,
          },
        ],
      },
    })
  })

  it('returns positionName from position when no customPositionName', async () => {
    const electionsService = service.app.get(ElectionsService)
    vi.spyOn(electionsService, 'getPositionById').mockResolvedValue({
      id: 'pos-pn1',
      brPositionId: 'br-pos-pn1',
      brDatabaseId: 'br-db-pn1',
      state: 'CA',
      name: 'Mayor',
    })

    await service.prisma.organization.create({
      data: {
        slug: 'campaign-4',
        ownerId: service.user.id,
        positionId: 'br-pos-pn1',
      },
    })

    await service.prisma.campaign.create({
      data: {
        userId: service.user.id,
        slug: 'test-campaign-pn1',
        details: { electionDate: '2026-11-03' },
        organizationSlug: 'campaign-4',
      },
    })

    const result = await service.client.get('/v1/organizations')

    expect(result).toMatchObject({
      status: 200,
      data: {
        organizations: [
          {
            slug: 'campaign-4',
            positionName: 'Mayor',
            name: '2026 Campaign',
          },
        ],
      },
    })
  })

  it('returns null positionName when no customPositionName or position', async () => {
    await service.prisma.organization.create({
      data: {
        slug: 'campaign-5',
        ownerId: service.user.id,
      },
    })

    await service.prisma.campaign.create({
      data: {
        userId: service.user.id,
        slug: 'test-campaign-pn2',
        details: {},
        organizationSlug: 'campaign-5',
      },
    })

    const result = await service.client.get('/v1/organizations')

    expect(result).toMatchObject({
      status: 200,
      data: {
        organizations: [
          {
            slug: 'campaign-5',
            positionName: null,
          },
        ],
      },
    })
  })

  it('prefers customPositionName over position name for positionName', async () => {
    const electionsService = service.app.get(ElectionsService)
    vi.spyOn(electionsService, 'getPositionById').mockResolvedValue({
      id: 'pos-pn2',
      brPositionId: 'br-pos-pn2',
      brDatabaseId: 'br-db-pn2',
      state: 'NY',
      name: 'City Council',
    })

    await service.prisma.organization.create({
      data: {
        slug: 'campaign-6',
        ownerId: service.user.id,
        positionId: 'br-pos-pn2',
        customPositionName: 'Custom Council',
      },
    })

    await service.prisma.campaign.create({
      data: {
        userId: service.user.id,
        slug: 'test-campaign-pn3',
        details: {},
        organizationSlug: 'campaign-6',
      },
    })

    const result = await service.client.get('/v1/organizations')

    expect(result).toMatchObject({
      status: 200,
      data: {
        organizations: [
          {
            slug: 'campaign-6',
            positionName: 'Custom Council',
          },
        ],
      },
    })
  })

  it('only returns organizations owned by the authenticated user', async () => {
    const otherUser = await service.prisma.user.create({
      data: { email: 'other@goodparty.org' },
    })

    await service.prisma.organization.create({
      data: {
        slug: 'other-org',
        ownerId: otherUser.id,
      },
    })

    await service.prisma.organization.create({
      data: {
        slug: 'my-org',
        ownerId: service.user.id,
      },
    })

    await service.prisma.campaign.create({
      data: {
        userId: service.user.id,
        slug: 'my-campaign',
        details: {},
        organizationSlug: 'my-org',
      },
    })

    const result = await service.client.get('/v1/organizations')

    expect(result.status).toBe(200)
    expect(result.data.organizations).toHaveLength(1)
    expect(result.data.organizations[0].slug).toBe('my-org')
  })

  it('returns multiple organizations from both campaigns and elected offices', async () => {
    const electionsService = service.app.get(ElectionsService)
    vi.spyOn(electionsService, 'getPositionById').mockResolvedValue({
      id: 'pos-456',
      brPositionId: 'br-pos-456',
      brDatabaseId: 'br-db-456',
      state: 'NY',
      name: 'City Council',
    })

    await service.prisma.organization.create({
      data: {
        slug: 'campaign-10',
        ownerId: service.user.id,
        positionId: 'br-pos-456',
      },
    })

    const campaign = await service.prisma.campaign.create({
      data: {
        userId: service.user.id,
        slug: 'test-campaign-multi',
        details: {},
        organizationSlug: 'campaign-10',
      },
    })

    await service.prisma.organization.create({
      data: {
        slug: 'eo-abc-123',
        ownerId: service.user.id,
        positionId: 'br-pos-456',
      },
    })

    await service.prisma.electedOffice.create({
      data: {
        organizationSlug: 'eo-abc-123',
        userId: service.user.id,
        campaignId: campaign.id,
        swornInDate: new Date('2026-01-15'),
      },
    })

    const result = await service.client.get('/v1/organizations')

    expect(result.status).toBe(200)
    expect(result.data.organizations).toHaveLength(2)

    const campaignOrg = result.data.organizations.find(
      (org: { slug: string }) => org.slug === 'campaign-10',
    )
    const eoOrg = result.data.organizations.find(
      (org: { slug: string }) => org.slug === 'eo-abc-123',
    )

    expect(campaignOrg).toMatchObject({
      slug: 'campaign-10',
      name: 'Campaign',
      campaignId: 10,
      electedOfficeId: null,
    })

    expect(eoOrg).toMatchObject({
      slug: 'eo-abc-123',
      name: 'City Council',
      positionName: 'City Council',
      electedOfficeId: 'abc-123',
      campaignId: null,
    })
  })
})

describe('GET /v1/organizations/:slug', () => {
  it('returns an organization by slug with name', async () => {
    await service.prisma.organization.create({
      data: {
        slug: 'campaign-99',
        ownerId: service.user.id,
        positionId: 'br-pos-789',
      },
    })

    await service.prisma.campaign.create({
      data: {
        userId: service.user.id,
        slug: 'test-campaign-99',
        details: { electionDate: '2026-11-03' },
        organizationSlug: 'campaign-99',
      },
    })

    const result = await service.client.get('/v1/organizations/campaign-99')

    expect(result).toMatchObject({
      status: 200,
      data: {
        slug: 'campaign-99',
        name: '2026 Campaign',
        campaignId: 99,
        electedOfficeId: null,
      },
    })
  })

  it('returns a campaign organization with "Campaign" name when no electionDate', async () => {
    await service.prisma.organization.create({
      data: {
        slug: 'campaign-50',
        ownerId: service.user.id,
      },
    })

    const result = await service.client.get('/v1/organizations/campaign-50')

    expect(result).toMatchObject({
      status: 200,
      data: {
        slug: 'campaign-50',
        name: 'Campaign',
        campaignId: 50,
        electedOfficeId: null,
      },
    })
  })

  it('returns an elected office organization with name from position', async () => {
    const electionsService = service.app.get(ElectionsService)
    vi.spyOn(electionsService, 'getPositionById').mockResolvedValue({
      id: 'pos-eo',
      brPositionId: 'br-pos-eo',
      brDatabaseId: 'br-db-eo',
      state: 'FL',
      name: 'School Board',
    })

    await service.prisma.organization.create({
      data: {
        slug: 'eo-def-456',
        ownerId: service.user.id,
        positionId: 'br-pos-eo',
      },
    })

    const result = await service.client.get('/v1/organizations/eo-def-456')

    expect(result).toMatchObject({
      status: 200,
      data: {
        slug: 'eo-def-456',
        name: 'School Board',
        positionName: 'School Board',
        electedOfficeId: 'def-456',
        campaignId: null,
      },
    })
  })

  it('returns positionName from customPositionName on elected office org', async () => {
    const electionsService = service.app.get(ElectionsService)
    vi.spyOn(electionsService, 'getPositionById').mockResolvedValue({
      id: 'pos-eo-custom',
      brPositionId: 'br-pos-eo-custom',
      brDatabaseId: 'br-db-eo-custom',
      state: 'TX',
      name: 'County Judge',
    })

    await service.prisma.organization.create({
      data: {
        slug: 'eo-custom-123',
        ownerId: service.user.id,
        positionId: 'br-pos-eo-custom',
        customPositionName: 'Custom Judge Title',
      },
    })

    const result = await service.client.get('/v1/organizations/eo-custom-123')

    expect(result).toMatchObject({
      status: 200,
      data: {
        slug: 'eo-custom-123',
        name: 'Custom Judge Title',
        positionName: 'Custom Judge Title',
        electedOfficeId: 'custom-123',
        campaignId: null,
      },
    })
  })

  it('ignores customPositionName for campaign orgs', async () => {
    await service.prisma.organization.create({
      data: {
        slug: 'campaign-100',
        ownerId: service.user.id,
        customPositionName: 'Custom Office Name',
      },
    })

    await service.prisma.campaign.create({
      data: {
        userId: service.user.id,
        slug: 'test-campaign-100',
        details: { electionDate: '2026-11-03' },
        organizationSlug: 'campaign-100',
      },
    })

    const result = await service.client.get('/v1/organizations/campaign-100')

    expect(result).toMatchObject({
      status: 200,
      data: {
        slug: 'campaign-100',
        name: '2026 Campaign',
        campaignId: 100,
        electedOfficeId: null,
      },
    })
  })

  it('returns 404 for a non-existent slug', async () => {
    const result = await service.client.get('/v1/organizations/does-not-exist')

    expect(result.status).toBe(404)
  })

  it('returns 404 for an organization owned by another user', async () => {
    const otherUser = await service.prisma.user.create({
      data: { email: 'other2@goodparty.org' },
    })

    await service.prisma.organization.create({
      data: {
        slug: 'other-user-org',
        ownerId: otherUser.id,
      },
    })

    const result = await service.client.get('/v1/organizations/other-user-org')

    expect(result.status).toBe(404)
  })
})

describe('PATCH /v1/organizations/:slug', () => {
  it('updates customPositionName', async () => {
    await service.prisma.organization.create({
      data: {
        slug: 'campaign-200',
        ownerId: service.user.id,
      },
    })

    await service.prisma.campaign.create({
      data: {
        userId: service.user.id,
        slug: 'test-campaign-200',
        details: { electionDate: '2026-11-03' },
        organizationSlug: 'campaign-200',
      },
    })

    const result = await service.client.patch(
      '/v1/organizations/campaign-200',
      {
        customPositionName: 'New Custom Name',
      },
    )

    expect(result).toMatchObject({
      status: 200,
      data: {
        slug: 'campaign-200',
        name: '2026 Campaign',
        campaignId: 200,
        electedOfficeId: null,
      },
    })
  })

  it('updates ballotReadyPositionId and resolves position', async () => {
    const electionsService = service.app.get(ElectionsService)
    vi.spyOn(electionsService, 'getPositionByBallotReadyId').mockResolvedValue({
      id: 'pos-new',
      brPositionId: 'br-pos-new',
      brDatabaseId: 'br-db-new',
      state: 'TX',
      name: 'Governor',
    })
    vi.spyOn(electionsService, 'getPositionById').mockResolvedValue({
      id: 'pos-new',
      brPositionId: 'br-pos-new',
      brDatabaseId: 'br-db-new',
      state: 'TX',
      name: 'Governor',
    })

    await service.prisma.organization.create({
      data: {
        slug: 'campaign-201',
        ownerId: service.user.id,
      },
    })

    await service.prisma.campaign.create({
      data: {
        userId: service.user.id,
        slug: 'test-campaign-201',
        details: {},
        organizationSlug: 'campaign-201',
      },
    })

    const result = await service.client.patch(
      '/v1/organizations/campaign-201',
      {
        ballotReadyPositionId: 'br-pos-new',
      },
    )

    expect(result.status).toBe(200)
    expect(result.data.slug).toBe('campaign-201')
  })

  it('returns 400 when ballotReadyPositionId resolves to no position', async () => {
    const electionsService = service.app.get(ElectionsService)
    vi.spyOn(electionsService, 'getPositionByBallotReadyId').mockResolvedValue(
      null,
    )

    await service.prisma.organization.create({
      data: {
        slug: 'campaign-202',
        ownerId: service.user.id,
      },
    })

    await service.prisma.campaign.create({
      data: {
        userId: service.user.id,
        slug: 'test-campaign-202',
        details: {},
        organizationSlug: 'campaign-202',
      },
    })

    const result = await service.client.patch(
      '/v1/organizations/campaign-202',
      {
        ballotReadyPositionId: 'nonexistent',
      },
    )

    expect(result.status).toBe(400)
  })

  it('sets overrideDistrictId when it differs from position district', async () => {
    const electionsService = service.app.get(ElectionsService)
    vi.spyOn(electionsService, 'getPositionByBallotReadyId').mockResolvedValue({
      id: 'pos-dist2',
      brPositionId: 'br-pos-dist2',
      brDatabaseId: 'br-db-dist2',
      state: 'CA',
      name: 'Mayor',
      district: {
        id: 'district-xyz',
        L2DistrictType: 'City',
        L2DistrictName: 'San Francisco',
        projectedTurnout: null,
      },
    })
    vi.spyOn(electionsService, 'getPositionById').mockResolvedValue({
      id: 'pos-dist2',
      brPositionId: 'br-pos-dist2',
      brDatabaseId: 'br-db-dist2',
      state: 'CA',
      name: 'Mayor',
      district: {
        id: 'district-xyz',
        L2DistrictType: 'City',
        L2DistrictName: 'San Francisco',
        projectedTurnout: null,
      },
    })
    vi.spyOn(electionsService, 'getDistrict').mockResolvedValue({
      id: 'different-district',
      L2DistrictType: 'City',
      L2DistrictName: 'Los Angeles',
      projectedTurnout: null,
    })

    await service.prisma.organization.create({
      data: {
        slug: 'campaign-204',
        ownerId: service.user.id,
      },
    })

    await service.prisma.campaign.create({
      data: {
        userId: service.user.id,
        slug: 'test-campaign-204',
        details: {},
        organizationSlug: 'campaign-204',
      },
    })

    const result = await service.client.patch(
      '/v1/organizations/campaign-204',
      {
        ballotReadyPositionId: 'br-pos-dist2',
        overrideDistrictId: 'different-district',
      },
    )

    expect(result.status).toBe(200)

    const updated = await service.prisma.organization.findUnique({
      where: { slug: 'campaign-204' },
    })
    expect(updated?.overrideDistrictId).toBe('different-district')
  })

  it('returns 404 for a non-existent slug', async () => {
    const result = await service.client.patch(
      '/v1/organizations/does-not-exist',
      { customPositionName: 'test' },
    )

    expect(result.status).toBe(404)
  })

  it('returns 404 for an organization owned by another user', async () => {
    const otherUser = await service.prisma.user.create({
      data: { email: 'other-patch@goodparty.org' },
    })

    await service.prisma.organization.create({
      data: {
        slug: 'other-patch-org',
        ownerId: otherUser.id,
      },
    })

    const result = await service.client.patch(
      '/v1/organizations/other-patch-org',
      { customPositionName: 'test' },
    )

    expect(result.status).toBe(404)
  })

  it('clears overrideDistrictId when set to null', async () => {
    const electionsService = service.app.get(ElectionsService)
    vi.spyOn(electionsService, 'getDistrict').mockResolvedValue({
      id: 'existing-district',
      L2DistrictType: 'County',
      L2DistrictName: 'Test County',
      projectedTurnout: null,
    })

    await service.prisma.organization.create({
      data: {
        slug: 'campaign-206',
        ownerId: service.user.id,
        overrideDistrictId: 'existing-district',
      },
    })

    await service.prisma.campaign.create({
      data: {
        userId: service.user.id,
        slug: 'test-campaign-206',
        details: {},
        organizationSlug: 'campaign-206',
      },
    })

    const result = await service.client.patch(
      '/v1/organizations/campaign-206',
      {
        overrideDistrictId: null,
      },
    )

    expect(result.status).toBe(200)

    const updated = await service.prisma.organization.findUnique({
      where: { slug: 'campaign-206' },
    })
    expect(updated?.overrideDistrictId).toBeNull()
  })

  it('preserves overrideDistrictId when not included in update', async () => {
    const electionsService = service.app.get(ElectionsService)
    vi.spyOn(electionsService, 'getDistrict').mockResolvedValue({
      id: 'keep-this-district',
      L2DistrictType: 'County',
      L2DistrictName: 'Test County',
      projectedTurnout: null,
    })

    await service.prisma.organization.create({
      data: {
        slug: 'campaign-207',
        ownerId: service.user.id,
        overrideDistrictId: 'keep-this-district',
      },
    })

    await service.prisma.campaign.create({
      data: {
        userId: service.user.id,
        slug: 'test-campaign-207',
        details: {},
        organizationSlug: 'campaign-207',
      },
    })

    const result = await service.client.patch(
      '/v1/organizations/campaign-207',
      {
        customPositionName: 'Some Name',
      },
    )

    expect(result.status).toBe(200)

    const updated = await service.prisma.organization.findUnique({
      where: { slug: 'campaign-207' },
    })
    expect(updated?.overrideDistrictId).toBe('keep-this-district')
  })

  it('passes includeDistrict: true when resolving position by ballotReadyPositionId', async () => {
    const electionsService = service.app.get(ElectionsService)
    const spy = vi
      .spyOn(electionsService, 'getPositionByBallotReadyId')
      .mockResolvedValue({
        id: 'pos-inc',
        brPositionId: 'br-pos-inc',
        brDatabaseId: 'br-db-inc',
        state: 'CA',
        name: 'Mayor',
        district: {
          id: 'dist-inc',
          L2DistrictType: 'City',
          L2DistrictName: 'Oakland',
          projectedTurnout: null,
        },
      })
    vi.spyOn(electionsService, 'getPositionById').mockResolvedValue({
      id: 'pos-inc',
      brPositionId: 'br-pos-inc',
      brDatabaseId: 'br-db-inc',
      state: 'CA',
      name: 'Mayor',
    })

    await service.prisma.organization.create({
      data: {
        slug: 'campaign-208',
        ownerId: service.user.id,
      },
    })

    await service.prisma.campaign.create({
      data: {
        userId: service.user.id,
        slug: 'test-campaign-208',
        details: {},
        organizationSlug: 'campaign-208',
      },
    })

    await service.client.patch('/v1/organizations/campaign-208', {
      ballotReadyPositionId: 'br-pos-inc',
    })

    expect(spy).toHaveBeenCalledWith('br-pos-inc', { includeDistrict: true })
  })

  it('clears customPositionName when set to null', async () => {
    await service.prisma.organization.create({
      data: {
        slug: 'campaign-205',
        ownerId: service.user.id,
        customPositionName: 'Old Name',
      },
    })

    await service.prisma.campaign.create({
      data: {
        userId: service.user.id,
        slug: 'test-campaign-205',
        details: { electionDate: '2026-11-03' },
        organizationSlug: 'campaign-205',
      },
    })

    const result = await service.client.patch(
      '/v1/organizations/campaign-205',
      {
        customPositionName: null,
      },
    )

    expect(result).toMatchObject({
      status: 200,
      data: {
        slug: 'campaign-205',
        name: '2026 Campaign',
        campaignId: 205,
      },
    })
  })
})

describe('GET /v1/organizations/admin/:slug', () => {
  it('returns 403 for non-admin users without an M2M token', async () => {
    await service.prisma.organization.create({
      data: {
        slug: 'campaign-401',
        ownerId: service.user.id,
      },
    })

    const result = await service.client.get(
      '/v1/organizations/admin/campaign-401',
    )

    expect(result.status).toBe(403)
  })

  it('returns an organization owned by another user when caller is admin', async () => {
    await service.prisma.user.update({
      where: { id: service.user.id },
      data: { roles: ['admin'] },
    })

    const otherUser = await service.prisma.user.create({
      data: { email: 'admin-target@goodparty.org' },
    })

    await service.prisma.organization.create({
      data: {
        slug: 'campaign-402',
        ownerId: otherUser.id,
      },
    })

    await service.prisma.campaign.create({
      data: {
        userId: otherUser.id,
        slug: 'admin-target-campaign',
        details: { electionDate: '2026-11-03' },
        organizationSlug: 'campaign-402',
      },
    })

    const result = await service.client.get(
      '/v1/organizations/admin/campaign-402',
    )

    expect(result).toMatchObject({
      status: 200,
      data: {
        slug: 'campaign-402',
        name: '2026 Campaign',
        campaignId: 402,
        electedOfficeId: null,
      },
    })
  })

  it('returns an EO organization owned by another user when caller is admin', async () => {
    await service.prisma.user.update({
      where: { id: service.user.id },
      data: { roles: ['admin'] },
    })

    const electionsService = service.app.get(ElectionsService)
    vi.spyOn(electionsService, 'getPositionById').mockResolvedValue({
      id: 'pos-eo-admin',
      brPositionId: 'br-pos-eo-admin',
      brDatabaseId: 'br-db-eo-admin',
      state: 'CO',
      name: 'County Commissioner',
    })

    const otherUser = await service.prisma.user.create({
      data: { email: 'admin-eo-target@goodparty.org' },
    })

    await service.prisma.organization.create({
      data: {
        slug: 'eo-admin-1',
        ownerId: otherUser.id,
        positionId: 'br-pos-eo-admin',
      },
    })

    const result = await service.client.get(
      '/v1/organizations/admin/eo-admin-1',
    )

    expect(result).toMatchObject({
      status: 200,
      data: {
        slug: 'eo-admin-1',
        name: 'County Commissioner',
        positionName: 'County Commissioner',
        electedOfficeId: 'admin-1',
        campaignId: null,
      },
    })
  })

  it('returns 404 for a non-existent slug when caller is admin', async () => {
    await service.prisma.user.update({
      where: { id: service.user.id },
      data: { roles: ['admin'] },
    })

    const result = await service.client.get(
      '/v1/organizations/admin/does-not-exist',
    )

    expect(result.status).toBe(404)
  })
})

describe('PATCH /v1/organizations/admin/:slug', () => {
  it('returns 403 for non-admin users without an M2M token', async () => {
    await service.prisma.organization.create({
      data: {
        slug: 'campaign-501',
        ownerId: service.user.id,
      },
    })

    const result = await service.client.patch(
      '/v1/organizations/admin/campaign-501',
      { customPositionName: 'Forbidden' },
    )

    expect(result.status).toBe(403)
  })

  it('updates an organization owned by another user when caller is admin', async () => {
    await service.prisma.user.update({
      where: { id: service.user.id },
      data: { roles: ['admin'] },
    })

    const otherUser = await service.prisma.user.create({
      data: { email: 'admin-patch-target@goodparty.org' },
    })

    await service.prisma.organization.create({
      data: {
        slug: 'campaign-502',
        ownerId: otherUser.id,
      },
    })

    await service.prisma.campaign.create({
      data: {
        userId: otherUser.id,
        slug: 'admin-patch-target-campaign',
        details: { electionDate: '2026-11-03' },
        organizationSlug: 'campaign-502',
      },
    })

    const result = await service.client.patch(
      '/v1/organizations/admin/campaign-502',
      { customPositionName: 'Admin Set Name' },
    )

    expect(result).toMatchObject({
      status: 200,
      data: {
        slug: 'campaign-502',
        name: '2026 Campaign',
        campaignId: 502,
      },
    })

    const updated = await service.prisma.organization.findUnique({
      where: { slug: 'campaign-502' },
    })
    expect(updated?.customPositionName).toBe('Admin Set Name')
  })

  it('resolves ballotReadyPositionId via election service when caller is admin', async () => {
    await service.prisma.user.update({
      where: { id: service.user.id },
      data: { roles: ['admin'] },
    })

    const electionsService = service.app.get(ElectionsService)
    vi.spyOn(electionsService, 'getPositionByBallotReadyId').mockResolvedValue({
      id: 'pos-admin-patch',
      brPositionId: 'br-pos-admin-patch',
      brDatabaseId: 'br-db-admin-patch',
      state: 'CA',
      name: 'Mayor',
    })
    vi.spyOn(electionsService, 'getPositionById').mockResolvedValue({
      id: 'pos-admin-patch',
      brPositionId: 'br-pos-admin-patch',
      brDatabaseId: 'br-db-admin-patch',
      state: 'CA',
      name: 'Mayor',
    })

    const otherUser = await service.prisma.user.create({
      data: { email: 'admin-patch-position@goodparty.org' },
    })

    await service.prisma.organization.create({
      data: {
        slug: 'campaign-503',
        ownerId: otherUser.id,
      },
    })

    await service.prisma.campaign.create({
      data: {
        userId: otherUser.id,
        slug: 'admin-patch-position-campaign',
        details: {},
        organizationSlug: 'campaign-503',
      },
    })

    const result = await service.client.patch(
      '/v1/organizations/admin/campaign-503',
      { ballotReadyPositionId: 'br-pos-admin-patch' },
    )

    expect(result.status).toBe(200)

    const updated = await service.prisma.organization.findUnique({
      where: { slug: 'campaign-503' },
    })
    expect(updated?.positionId).toBe('pos-admin-patch')
  })

  it('returns 404 for a non-existent slug when caller is admin', async () => {
    await service.prisma.user.update({
      where: { id: service.user.id },
      data: { roles: ['admin'] },
    })

    const result = await service.client.patch(
      '/v1/organizations/admin/does-not-exist',
      { customPositionName: 'whatever' },
    )

    expect(result.status).toBe(404)
  })
})

describe('GET /v1/organizations/admin/list', () => {
  it('returns 403 for non-admin users without an M2M token', async () => {
    const result = await service.client.get('/v1/organizations/admin/list')

    expect(result.status).toBe(403)
  })

  it('returns organizations with extra owner and campaign fields', async () => {
    await service.prisma.user.update({
      where: { id: service.user.id },
      data: { roles: ['admin'] },
    })

    const otherUser = await service.prisma.user.create({
      data: {
        email: 'org-owner@goodparty.org',
        firstName: 'Jane',
        lastName: 'Doe',
        phone: '555-1234',
      },
    })

    await service.prisma.organization.create({
      data: {
        slug: 'campaign-300',
        ownerId: otherUser.id,
      },
    })

    await service.prisma.campaign.create({
      data: {
        userId: otherUser.id,
        slug: 'admin-list-campaign',
        details: {},
        organizationSlug: 'campaign-300',
      },
    })

    const result = await service.client.get(
      '/v1/organizations/admin/list?slug=campaign-300',
    )

    expect(result.status).toBe(200)
    expect(result.data.organizations).toHaveLength(1)
    expect(result.data.organizations[0]).toMatchObject({
      slug: 'campaign-300',
      name: 'Campaign',
      campaignId: 300,
      electedOfficeId: null,
      extra: {
        owner: {
          id: otherUser.id,
          email: 'org-owner@goodparty.org',
          firstName: 'Jane',
          lastName: 'Doe',
          phone: '555-1234',
        },
        campaign: {
          slug: 'admin-list-campaign',
        },
      },
    })
  })

  it('returns null campaign in extra when org has no campaign', async () => {
    await service.prisma.user.update({
      where: { id: service.user.id },
      data: { roles: ['admin'] },
    })

    const otherUser = await service.prisma.user.create({
      data: { email: 'no-campaign-owner@goodparty.org' },
    })

    await service.prisma.organization.create({
      data: {
        slug: 'campaign-310',
        ownerId: otherUser.id,
      },
    })

    const result = await service.client.get(
      '/v1/organizations/admin/list?slug=campaign-310',
    )

    expect(result.status).toBe(200)
    expect(result.data.organizations[0].extra.campaign).toBeNull()
  })

  it('filters organizations by owner email', async () => {
    await service.prisma.user.update({
      where: { id: service.user.id },
      data: { roles: ['admin'] },
    })

    const user1 = await service.prisma.user.create({
      data: { email: 'alice@goodparty.org' },
    })
    const user2 = await service.prisma.user.create({
      data: { email: 'bob@example.com' },
    })

    await service.prisma.organization.create({
      data: { slug: 'campaign-301', ownerId: user1.id },
    })
    await service.prisma.campaign.create({
      data: {
        userId: user1.id,
        slug: 'alice-campaign',
        details: {},
        organizationSlug: 'campaign-301',
      },
    })

    await service.prisma.organization.create({
      data: { slug: 'campaign-302', ownerId: user2.id },
    })
    await service.prisma.campaign.create({
      data: {
        userId: user2.id,
        slug: 'bob-campaign',
        details: {},
        organizationSlug: 'campaign-302',
      },
    })

    const result = await service.client.get(
      '/v1/organizations/admin/list?email=alice',
    )

    expect(result.status).toBe(200)
    expect(result.data.organizations).toHaveLength(1)
    expect(result.data.organizations[0].slug).toBe('campaign-301')
  })

  it('returns empty list when filter matches no users', async () => {
    await service.prisma.user.update({
      where: { id: service.user.id },
      data: { roles: ['admin'] },
    })

    const result = await service.client.get(
      '/v1/organizations/admin/list?filter=nonexistent@nowhere.com',
    )

    expect(result.status).toBe(200)
    expect(result.data.organizations).toHaveLength(0)
  })
})
