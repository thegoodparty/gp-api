import { useTestService } from '@/test-service'
import { describe, expect, it } from 'vitest'
import { OrganizationsService } from './organizations.service'

const service = useTestService()

describe('OrganizationsService', () => {
  describe('slug helpers', () => {
    it('campaignOrgSlug returns campaign-{id}', () => {
      expect(OrganizationsService.campaignOrgSlug(42)).toBe('campaign-42')
    })

    it('electedOfficeOrgSlug returns eo-{id}', () => {
      expect(OrganizationsService.electedOfficeOrgSlug('abc-123')).toBe(
        'eo-abc-123',
      )
    })
  })

  describe('setOverrideDistrictId', () => {
    it('updates overrideDistrictId when org exists', async () => {
      await service.prisma.organization.create({
        data: { slug: 'campaign-1', ownerId: service.user.id },
      })

      const orgService = service.app.get(OrganizationsService)
      const result = await orgService.setOverrideDistrictId(
        'campaign-1',
        'district-uuid-123',
      )

      expect(result).toMatchObject({
        slug: 'campaign-1',
        overrideDistrictId: 'district-uuid-123',
      })
    })

    it('returns null when org does not exist', async () => {
      const orgService = service.app.get(OrganizationsService)
      const result = await orgService.setOverrideDistrictId(
        'nonexistent',
        'district-uuid-123',
      )

      expect(result).toBeNull()
    })

    it('handles null districtId', async () => {
      await service.prisma.organization.create({
        data: {
          slug: 'campaign-2',
          ownerId: service.user.id,
          overrideDistrictId: 'old-district',
        },
      })

      const orgService = service.app.get(OrganizationsService)
      const result = await orgService.setOverrideDistrictId('campaign-2', null)

      expect(result).toMatchObject({
        slug: 'campaign-2',
        overrideDistrictId: null,
      })
    })
  })
})
