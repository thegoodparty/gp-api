import { useTestService } from '@/test-service'
import { describe, expect, it } from 'vitest'

const service = useTestService()

/**
 * Integration tests for the UseCampaign guard's resolution paths.
 * Tests against GET /v1/campaigns/mine which uses @UseCampaign() and returns the campaign directly,
 * allowing us to verify the correct campaign was resolved.
 */
describe('UseCampaign guard (integration)', () => {
  async function createCampaignWithOrg(slugSuffix: string) {
    const org = await service.prisma.organization.create({
      data: {
        slug: `campaign-org-${slugSuffix}`,
        ownerId: service.user.id,
      },
    })

    const campaign = await service.prisma.campaign.create({
      data: {
        userId: service.user.id,
        slug: `test-campaign-${slugSuffix}`,
        details: {},
        organizationSlug: org.slug,
      },
    })

    return { org, campaign }
  }

  describe('legacy fallback (no header)', () => {
    it('resolves campaign by userId', async () => {
      const legacyOrg = await service.prisma.organization.create({
        data: {
          slug: `legacy-org-${Date.now()}`,
          ownerId: service.user.id,
        },
      })
      const campaign = await service.prisma.campaign.create({
        data: {
          userId: service.user.id,
          slug: 'legacy-campaign',
          details: {},
          organizationSlug: legacyOrg.slug,
        },
      })

      const result = await service.client.get('/v1/campaigns/mine')

      expect(result.status).toBe(200)
      expect(result.data.slug).toBe('legacy-campaign')
      expect(result.data.id).toBe(campaign.id)
    })

    it('returns 404 when user has no campaign', async () => {
      const result = await service.client.get('/v1/campaigns/mine')

      expect(result.status).toBe(404)
    })
  })

  describe('x-organization-slug header', () => {
    it('resolves campaign via organization header', async () => {
      const { org, campaign } = await createCampaignWithOrg('header-test')

      const result = await service.client.get('/v1/campaigns/mine', {
        headers: { 'x-organization-slug': org.slug },
      })

      expect(result.status).toBe(200)
      expect(result.data.slug).toBe(campaign.slug)
      expect(result.data.id).toBe(campaign.id)
    })

    it('resolves the correct campaign when user has multiple orgs', async () => {
      const { org: org1 } = await createCampaignWithOrg('multi-1')
      const { org: org2, campaign: campaign2 } =
        await createCampaignWithOrg('multi-2')

      // Request with org2 header should resolve campaign2, not campaign1
      const result = await service.client.get('/v1/campaigns/mine', {
        headers: { 'x-organization-slug': org2.slug },
      })

      expect(result.status).toBe(200)
      expect(result.data.slug).toBe(campaign2.slug)
      expect(result.data.id).toBe(campaign2.id)

      // Request with org1 header should resolve campaign1
      const result1 = await service.client.get('/v1/campaigns/mine', {
        headers: { 'x-organization-slug': org1.slug },
      })

      expect(result1.status).toBe(200)
      expect(result1.data.slug).toBe('test-campaign-multi-1')
    })

    it('falls back to userId when org slug does not exist', async () => {
      const fallbackOrg = await service.prisma.organization.create({
        data: {
          slug: `fallback-org-${Date.now()}`,
          ownerId: service.user.id,
        },
      })
      const campaign = await service.prisma.campaign.create({
        data: {
          userId: service.user.id,
          slug: 'fallback-campaign',
          details: {},
          organizationSlug: fallbackOrg.slug,
        },
      })

      const result = await service.client.get('/v1/campaigns/mine', {
        headers: { 'x-organization-slug': 'nonexistent-slug' },
      })

      expect(result.status).toBe(200)
      expect(result.data.slug).toBe('fallback-campaign')
      expect(result.data.id).toBe(campaign.id)
    })

    it('falls back to userId when org has no campaign', async () => {
      const orgWithoutCampaign = await service.prisma.organization.create({
        data: {
          slug: 'no-campaign-org',
          ownerId: service.user.id,
        },
      })

      const fallbackNoOrgCampaignOrg = await service.prisma.organization.create({
        data: {
          slug: `fallback-no-org-campaign-org-${Date.now()}`,
          ownerId: service.user.id,
        },
      })
      const campaign = await service.prisma.campaign.create({
        data: {
          userId: service.user.id,
          slug: 'fallback-no-org-campaign',
          details: {},
          organizationSlug: fallbackNoOrgCampaignOrg.slug,
        },
      })

      const result = await service.client.get('/v1/campaigns/mine', {
        headers: { 'x-organization-slug': orgWithoutCampaign.slug },
      })

      expect(result.status).toBe(200)
      expect(result.data.slug).toBe('fallback-no-org-campaign')
      expect(result.data.id).toBe(campaign.id)
    })

    it('returns 404 when org belongs to another user and no fallback campaign', async () => {
      const otherUser = await service.prisma.user.create({
        data: { email: 'other@goodparty.org' },
      })

      const otherOrg = await service.prisma.organization.create({
        data: {
          slug: 'other-user-org',
          ownerId: otherUser.id,
        },
      })

      const result = await service.client.get('/v1/campaigns/mine', {
        headers: { 'x-organization-slug': otherOrg.slug },
      })

      expect(result.status).toBe(404)
    })
  })
})
