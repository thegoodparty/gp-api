import { useTestService } from '@/test-service'
import { Campaign } from '@prisma/client'
import { beforeEach, describe, expect, it } from 'vitest'

const service = useTestService()

describe('ElectedOfficeController', () => {
  let campaign: Campaign
  let orgSlug: string

  beforeEach(async () => {
    const suffix = Date.now()
    orgSlug = `campaign-${suffix}`
    await service.prisma.organization.create({
      data: {
        slug: orgSlug,
        ownerId: service.user.id,
        positionId: '2875e5f3-ecf0-6fae-f270-6951f85e8468',
      },
    })
    campaign = await service.prisma.campaign.create({
      data: {
        userId: service.user.id,
        slug: `test-campaign-${suffix}`,
        organizationSlug: orgSlug,
      },
    })
  })

  const createElectedOffice = (body: Record<string, unknown> = {}) =>
    service.client.post('/v1/elected-office', body, {
      headers: { 'x-organization-slug': orgSlug },
    })

  describe('GET /elected-office/current', () => {
    it('returns current elected office', async () => {
      const created = await createElectedOffice({
        swornInDate: '2024-01-15',
      })
      expect(created.status).toBe(201)

      const eoOrgSlug = `eo-${created.data.id}`
      const result = await service.client.get('/v1/elected-office/current', {
        headers: { 'x-organization-slug': eoOrgSlug },
      })

      expect(result.status).toBe(200)
      expect(result.data).toEqual({
        id: created.data.id,
        swornInDate: '2024-01-15',
      })
    })

    it('returns 404 when no elected office exists', async () => {
      const result = await service.client.get('/v1/elected-office/current', {
        headers: { 'x-organization-slug': orgSlug },
      })

      expect(result.status).toBe(404)
    })

    it('resolves elected office via x-organization-slug header', async () => {
      const created = await createElectedOffice({
        swornInDate: '2024-01-15',
      })
      expect(created.status).toBe(201)

      const eoOrgSlug = `eo-${created.data.id}`
      const result = await service.client.get('/v1/elected-office/current', {
        headers: { 'x-organization-slug': eoOrgSlug },
      })

      expect(result.status).toBe(200)
      expect(result.data).toEqual({
        id: created.data.id,
        swornInDate: '2024-01-15',
      })
    })

    it('returns 404 when x-organization-slug does not match any elected office', async () => {
      const result = await service.client.get('/v1/elected-office/current', {
        headers: { 'x-organization-slug': 'nonexistent-org' },
      })

      expect(result.status).toBe(404)
    })

    it('returns 404 when org belongs to another user', async () => {
      const otherUser = await service.prisma.user.create({
        data: {
          email: 'other-eo@goodparty.org',
          firstName: 'Other',
          lastName: 'User',
        },
      })

      const otherOrg = await service.prisma.organization.create({
        data: {
          slug: `other-eo-org-${Date.now()}`,
          ownerId: otherUser.id,
        },
      })

      await service.prisma.electedOffice.create({
        data: {
          userId: otherUser.id,
          campaignId: campaign.id,
          organizationSlug: otherOrg.slug,
        },
      })

      const result = await service.client.get('/v1/elected-office/current', {
        headers: { 'x-organization-slug': otherOrg.slug },
      })

      expect(result.status).toBe(404)
    })
  })

  describe('GET /elected-office/:id', () => {
    it('returns toApi format for owner', async () => {
      const created = await createElectedOffice({
        swornInDate: '2024-01-15',
      })

      const result = await service.client.get(
        `/v1/elected-office/${created.data.id}`,
      )

      expect(result.status).toBe(200)
      expect(result.data).toEqual({
        id: created.data.id,
        swornInDate: '2024-01-15',
      })
    })

    it('returns 404 when elected office does not exist', async () => {
      const result = await service.client.get(
        '/v1/elected-office/nonexistent-id',
      )

      expect(result.status).toBe(404)
    })

    it('returns 403 when user does not own the record', async () => {
      const otherUser = await service.prisma.user.create({
        data: {
          email: 'other@goodparty.org',
          firstName: 'Other',
          lastName: 'User',
        },
      })

      const otherOrgSlug = `campaign-other-${Date.now()}`
      await service.prisma.organization.create({
        data: { slug: otherOrgSlug, ownerId: otherUser.id },
      })
      await service.prisma.campaign.create({
        data: {
          userId: otherUser.id,
          slug: `other-campaign-${Date.now()}`,
          organizationSlug: otherOrgSlug,
        },
      })

      const eoOrgSlug = `eo-other-${Date.now()}`
      await service.prisma.organization.create({
        data: { slug: eoOrgSlug, ownerId: otherUser.id },
      })
      const office = await service.prisma.electedOffice.create({
        data: {
          userId: otherUser.id,
          campaignId: campaign.id,
          organizationSlug: eoOrgSlug,
        },
      })

      const result = await service.client.get(`/v1/elected-office/${office.id}`)

      expect(result.status).toBe(403)
    })
  })

  describe('POST /elected-office', () => {
    it('creates elected office when user has a campaign', async () => {
      const result = await createElectedOffice({
        swornInDate: '2024-01-15',
      })

      expect(result.status).toBe(201)
      expect(result.data).toEqual({
        id: expect.any(String),
        swornInDate: '2024-01-15',
      })

      const organization = await service.prisma.organization.findUnique({
        where: { slug: `eo-${result.data.id}` },
      })
      expect(organization).toBeDefined()
      expect(organization?.slug).toBe(`eo-${result.data.id}`)

      const electedOffice = await service.prisma.electedOffice.findFirst({
        where: { id: result.data.id },
      })
      expect(electedOffice).toBeDefined()
      expect(electedOffice?.organizationSlug).toBe(organization?.slug)
    })

    it('creates elected office with only required fields', async () => {
      const result = await createElectedOffice()

      expect(result.status).toBe(201)
      expect(result.data).toMatchObject({
        id: expect.any(String),
      })

      const organization = await service.prisma.organization.findUnique({
        where: { slug: `eo-${result.data.id}` },
      })
      expect(organization).toBeDefined()
      expect(organization?.slug).toBe(`eo-${result.data.id}`)

      const electedOffice = await service.prisma.electedOffice.findFirst({
        where: { id: result.data.id },
      })
      expect(electedOffice).toBeDefined()
      expect(electedOffice?.organizationSlug).toBe(organization?.slug)
    })

    it('creates elected office when organization has no positionId', async () => {
      await service.prisma.organization.update({
        where: { slug: campaign.organizationSlug ?? undefined },
        data: { positionId: null },
      })

      const result = await createElectedOffice()

      expect(result.status).toBe(201)
      expect(result.data).toMatchObject({
        id: expect.any(String),
      })
    })

    it('returns 403 when user has no campaign', async () => {
      await service.prisma.campaign.deleteMany({
        where: { userId: service.user.id },
      })

      const result = await createElectedOffice()

      expect(result.status).toBe(403)
    })
  })

  describe('PUT /elected-office/:id', () => {
    it('updates elected office fields', async () => {
      const created = await createElectedOffice()

      const result = await service.client.put(
        `/v1/elected-office/${created.data.id}`,
        {
          swornInDate: '2024-01-15',
        },
      )

      expect(result.status).toBe(200)
      expect(result.data).toEqual({
        id: created.data.id,
        swornInDate: '2024-01-15',
      })
    })

    it('returns 404 when elected office does not exist', async () => {
      const result = await service.client.put(
        '/v1/elected-office/nonexistent-id',
        { swornInDate: '2024-01-15' },
      )

      expect(result.status).toBe(404)
    })

    it('returns 403 when user does not own the record', async () => {
      const otherUser = await service.prisma.user.create({
        data: {
          email: 'other@goodparty.org',
          firstName: 'Other',
          lastName: 'User',
        },
      })

      const eoOrgSlug = `eo-update-other-${Date.now()}`
      await service.prisma.organization.create({
        data: { slug: eoOrgSlug, ownerId: otherUser.id },
      })
      const office = await service.prisma.electedOffice.create({
        data: {
          userId: otherUser.id,
          campaignId: campaign.id,
          organizationSlug: eoOrgSlug,
        },
      })

      const result = await service.client.put(
        `/v1/elected-office/${office.id}`,
        { swornInDate: '2024-01-15' },
      )

      expect(result.status).toBe(403)
    })

    it('updates elected office with null values', async () => {
      const created = await createElectedOffice({
        swornInDate: '2024-01-15',
      })

      const result = await service.client.put(
        `/v1/elected-office/${created.data.id}`,
        {
          swornInDate: null,
        },
      )

      expect(result.status).toBe(200)
      expect(result.data).toMatchObject({
        id: created.data.id,
      })
      expect(result.data.swornInDate).toBeUndefined()
    })
  })
})
