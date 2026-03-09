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

  it('returns customPositionName as name when set', async () => {
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
            name: 'Custom Office Name',
            campaignId: 3,
            electedOfficeId: null,
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
        details: { positionId: 'br-pos-456' },
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
        electedDate: new Date('2025-11-05'),
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
        electedOfficeId: 'def-456',
        campaignId: null,
      },
    })
  })

  it('returns customPositionName as name when set', async () => {
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
        name: 'Custom Office Name',
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
