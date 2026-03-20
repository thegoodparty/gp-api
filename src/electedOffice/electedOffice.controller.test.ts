import { beforeEach, describe, expect, it } from 'vitest'
import { useTestService } from '@/test-service'
import { Campaign } from '@prisma/client'

const service = useTestService()

describe('ElectedOfficeController', () => {
  let campaign: Campaign

  beforeEach(async () => {
    const tempOrg = await service.prisma.organization.create({
      data: {
        slug: `campaign-org-${Date.now()}`,
        ownerId: service.user.id,
        positionId: '2875e5f3-ecf0-6fae-f270-6951f85e8468',
      },
    })
    campaign = await service.prisma.campaign.create({
      data: {
        userId: service.user.id,
        slug: `test-campaign-${Date.now()}`,
        organizationSlug: tempOrg.slug,
      },
    })
  })

  const createElectedOffice = (
    body: Record<string, unknown> = {
      electedDate: '2024-01-01',
      isActive: true,
    },
  ) => service.client.post('/v1/elected-office', body)

  describe('GET /elected-office/current', () => {
    it('returns current active elected office', async () => {
      const created = await createElectedOffice({
        electedDate: '2024-01-01',
        swornInDate: '2024-01-15',
        termStartDate: '2024-01-15',
        termEndDate: '2026-01-15',
        termLengthDays: 730,
        isActive: true,
      })
      expect(created.status).toBe(201)

      const result = await service.client.get('/v1/elected-office/current')

      expect(result.status).toBe(200)
      expect(result.data).toEqual({
        id: created.data.id,
        electedDate: '2024-01-01',
        swornInDate: '2024-01-15',
        termStartDate: '2024-01-15',
        termEndDate: '2026-01-15',
      })
    })

    it('returns 404 when no active elected office exists', async () => {
      const result = await service.client.get('/v1/elected-office/current')

      expect(result.status).toBe(404)
    })
  })

  describe('GET /elected-office/:id', () => {
    it('returns toApi format for owner', async () => {
      const created = await createElectedOffice({
        electedDate: '2024-01-01',
        swornInDate: '2024-01-15',
        termStartDate: '2024-01-15',
        termEndDate: '2026-01-15',
        termLengthDays: 730,
        isActive: true,
      })

      const result = await service.client.get(
        `/v1/elected-office/${created.data.id}`,
      )

      expect(result.status).toBe(200)
      expect(result.data).toEqual({
        id: created.data.id,
        electedDate: '2024-01-01',
        swornInDate: '2024-01-15',
        termStartDate: '2024-01-15',
        termEndDate: '2026-01-15',
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

      const otherUserOrg = await service.prisma.organization.create({
        data: {
          slug: `other-user-org-${Date.now()}`,
          ownerId: otherUser.id,
        },
      })

      await service.prisma.campaign.create({
        data: {
          userId: otherUser.id,
          slug: `other-campaign-${Date.now()}`,
          organizationSlug: otherUserOrg.slug,
        },
      })

      const eoOrg = await service.prisma.organization.create({
        data: {
          slug: `eo-org-get-${Date.now()}`,
          ownerId: otherUser.id,
        },
      })

      const office = await service.prisma.electedOffice.create({
        data: {
          electedDate: new Date('2024-01-01'),
          isActive: true,
          userId: otherUser.id,
          campaignId: campaign.id,
          organizationSlug: eoOrg.slug,
        },
      })

      const result = await service.client.get(`/v1/elected-office/${office.id}`)

      expect(result.status).toBe(403)
    })
  })

  describe('POST /elected-office', () => {
    it('creates elected office when user has a campaign', async () => {
      const result = await createElectedOffice({
        electedDate: '2024-01-01',
        swornInDate: '2024-01-15',
        termStartDate: '2024-01-15',
        termEndDate: '2026-01-15',
        termLengthDays: 730,
        isActive: true,
      })

      expect(result.status).toBe(201)
      expect(result.data).toEqual({
        id: expect.any(String),
        electedDate: '2024-01-01',
        swornInDate: '2024-01-15',
        termStartDate: '2024-01-15',
        termEndDate: '2026-01-15',
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
      const result = await createElectedOffice({
        electedDate: '2024-01-01',
      })

      expect(result.status).toBe(201)
      expect(result.data).toMatchObject({
        id: expect.any(String),
        electedDate: '2024-01-01',
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
        where: { slug: campaign.organizationSlug! },
        data: { positionId: null },
      })

      const result = await createElectedOffice({
        electedDate: '2024-01-01',
        isActive: true,
      })

      expect(result.status).toBe(201)
      expect(result.data).toMatchObject({
        id: expect.any(String),
        electedDate: '2024-01-01',
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
      const created = await createElectedOffice({
        electedDate: '2024-01-01',
        isActive: true,
      })

      const result = await service.client.put(
        `/v1/elected-office/${created.data.id}`,
        {
          swornInDate: '2024-01-15',
          termStartDate: '2024-01-15',
          termEndDate: '2026-01-15',
          termLengthDays: 730,
        },
      )

      expect(result.status).toBe(200)
      expect(result.data).toEqual({
        id: created.data.id,
        electedDate: '2024-01-01',
        swornInDate: '2024-01-15',
        termStartDate: '2024-01-15',
        termEndDate: '2026-01-15',
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

      const eoOrg = await service.prisma.organization.create({
        data: {
          slug: `eo-org-put-${Date.now()}`,
          ownerId: otherUser.id,
        },
      })

      const office = await service.prisma.electedOffice.create({
        data: {
          electedDate: new Date('2024-01-01'),
          isActive: true,
          userId: otherUser.id,
          campaignId: campaign.id,
          organizationSlug: eoOrg.slug,
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
        electedDate: '2024-01-01',
        swornInDate: '2024-01-15',
        termStartDate: '2024-01-15',
        termEndDate: '2026-01-15',
        termLengthDays: 730,
        isActive: true,
      })

      const result = await service.client.put(
        `/v1/elected-office/${created.data.id}`,
        {
          swornInDate: null,
          termStartDate: null,
          termEndDate: null,
          termLengthDays: null,
        },
      )

      expect(result.status).toBe(200)
      expect(result.data).toMatchObject({
        id: created.data.id,
        electedDate: '2024-01-01',
      })
      expect(result.data.swornInDate).toBeUndefined()
      expect(result.data.termStartDate).toBeUndefined()
      expect(result.data.termEndDate).toBeUndefined()
    })
  })
})
