import { useTestService } from '@/test-service'
import { Campaign } from '@prisma/client'
import { beforeEach, describe, expect, it } from 'vitest'

const service = useTestService()

/**
 * Integration tests for the UseElectedOffice guard's resolution paths.
 * Tests against GET /v1/polls/has-polls which uses @UseElectedOffice() at class level.
 */
describe('UseElectedOffice guard (integration)', () => {
  let campaign: Campaign

  beforeEach(async () => {
    const campaignId = 8888
    const campaignOrgSlug = `campaign-${campaignId}`
    await service.prisma.organization.create({
      data: {
        slug: campaignOrgSlug,
        ownerId: service.user.id,
      },
    })
    campaign = await service.prisma.campaign.create({
      data: {
        userId: service.user.id,
        id: campaignId,
        slug: `test-campaign-${campaignId}`,
        organizationSlug: campaignOrgSlug,
        details: {},
      },
    })
  })

  async function createElectedOfficeWithOrg() {
    const org = await service.prisma.organization.create({
      data: {
        slug: `eo-org-${Date.now()}`,
        ownerId: service.user.id,
      },
    })

    const eo = await service.prisma.electedOffice.create({
      data: {
        userId: service.user.id,
        campaignId: campaign.id,
        organizationSlug: org.slug,
      },
    })

    return { org, eo }
  }

  describe('no header', () => {
    it('returns 404 when no org header is provided (even if user has an elected office)', async () => {
      await createElectedOfficeWithOrg()
      const result = await service.client.get('/v1/polls/has-polls')

      expect(result.status).toBe(404)
    })
  })

  describe('x-organization-slug header', () => {
    it('resolves elected office via organization header', async () => {
      const { org } = await createElectedOfficeWithOrg()

      const result = await service.client.get('/v1/polls/has-polls', {
        headers: { 'x-organization-slug': org.slug },
      })

      expect(result.status).toBe(200)
      expect(result.data).toEqual({ hasPolls: false })
    })

    it('returns 404 when org belongs to another user and no fallback EO', async () => {
      const otherUser = await service.prisma.user.create({
        data: { email: 'other@goodparty.org' },
      })

      const otherOrg = await service.prisma.organization.create({
        data: {
          slug: `other-org-${Date.now()}`,
          ownerId: otherUser.id,
        },
      })

      const result = await service.client.get('/v1/polls/has-polls', {
        headers: { 'x-organization-slug': otherOrg.slug },
      })

      // Org lookup fails (wrong ownerId), no fallback EO exists → 404
      expect(result.status).toBe(404)
    })
  })
})
