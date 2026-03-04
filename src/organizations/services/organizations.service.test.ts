import { describe, expect, it } from 'vitest'
import { OrganizationsService } from './organizations.service'

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
})
