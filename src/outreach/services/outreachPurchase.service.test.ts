import { BadRequestException } from '@nestjs/common'
import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import { FREE_TEXTS_OFFER } from '@/shared/constants/freeTextsOffer'
import {
  calcTextAmountInCents,
  PRICE_PER_TEXT_TENTH_CENTS,
} from '@/shared/util/textPricing.util'
import { CampaignsService } from 'src/campaigns/services/campaigns.service'
import { OutreachPurchaseMetadata } from '../types/outreach.types'
import { OutreachPurchaseHandlerService } from './outreachPurchase.service'
import { describe, expect, it, vi } from 'vitest'

const mockCampaignsService = {
  checkFreeTextsEligibility: vi.fn(),
  redeemFreeTexts: vi.fn(),
} as unknown as CampaignsService

const service = new OutreachPurchaseHandlerService(
  mockCampaignsService,
  createMockLogger(),
)

const baseMetadata: OutreachPurchaseMetadata = {
  contactCount: 500,
  outreachType: 'p2p',
  audienceSize: 1000,
}

describe('calcTextAmountInCents', () => {
  it('returns 4 cents for 1 text', () => {
    expect(calcTextAmountInCents(1)).toBe(4)
  })

  it('returns 0 for 0 texts', () => {
    expect(calcTextAmountInCents(0)).toBe(0)
  })

  it('returns 1750 cents for 500 texts', () => {
    expect(calcTextAmountInCents(500)).toBe(1750)
  })

  it('uses integer arithmetic consistently', () => {
    expect(calcTextAmountInCents(3)).toBe(
      Math.floor((3 * PRICE_PER_TEXT_TENTH_CENTS + 5) / 10),
    )
  })
})

describe('OutreachPurchaseHandlerService', () => {
  describe('validatePurchase', () => {
    it('throws when contactCount is missing', async () => {
      await expect(
        service.validatePurchase({
          ...baseMetadata,
          contactCount: 0,
        }),
      ).rejects.toThrow(BadRequestException)
    })

    it('passes with valid contactCount', async () => {
      await expect(
        service.validatePurchase(baseMetadata),
      ).resolves.toBeUndefined()
    })

    it('ignores pricePerContact from client', async () => {
      await expect(
        service.validatePurchase({
          ...baseMetadata,
          pricePerContact: 0,
        }),
      ).resolves.toBeUndefined()
    })
  })

  describe('calculateAmount', () => {
    it('uses server-side pricing, not client pricePerContact', async () => {
      const amount = await service.calculateAmount({
        ...baseMetadata,
        campaignId: undefined,
        pricePerContact: 0,
      })

      expect(amount).toBe(calcTextAmountInCents(500))
      expect(amount).toBeGreaterThan(0)
    })

    it('skips discount check when outreachType is not p2p', async () => {
      const amount = await service.calculateAmount({
        ...baseMetadata,
        campaignId: 1,
        outreachType: 'text',
      })

      expect(amount).toBe(calcTextAmountInCents(500))
      expect(
        mockCampaignsService.checkFreeTextsEligibility,
      ).not.toHaveBeenCalled()
    })

    it('skips discount check when campaignId is missing', async () => {
      const amount = await service.calculateAmount({
        ...baseMetadata,
        campaignId: undefined,
      })

      expect(amount).toBe(calcTextAmountInCents(500))
      expect(
        mockCampaignsService.checkFreeTextsEligibility,
      ).not.toHaveBeenCalled()
    })

    it('applies free texts discount for eligible p2p campaign', async () => {
      vi.mocked(
        mockCampaignsService.checkFreeTextsEligibility,
      ).mockResolvedValue(true)

      const contactCount = 7000
      const amount = await service.calculateAmount({
        ...baseMetadata,
        contactCount,
        campaignId: 1,
      })

      const billable = contactCount - FREE_TEXTS_OFFER.COUNT
      expect(amount).toBe(calcTextAmountInCents(billable))
    })

    it('returns 0 when contactCount equals FREE_TEXTS_OFFER.COUNT exactly', async () => {
      vi.mocked(
        mockCampaignsService.checkFreeTextsEligibility,
      ).mockResolvedValue(true)

      const amount = await service.calculateAmount({
        ...baseMetadata,
        contactCount: FREE_TEXTS_OFFER.COUNT,
        campaignId: 1,
      })

      expect(amount).toBe(0)
    })

    it('returns 0 when contactCount is below FREE_TEXTS_OFFER.COUNT', async () => {
      vi.mocked(
        mockCampaignsService.checkFreeTextsEligibility,
      ).mockResolvedValue(true)

      const amount = await service.calculateAmount({
        ...baseMetadata,
        contactCount: 100,
        campaignId: 1,
      })

      expect(amount).toBe(0)
    })

    it('charges full price when campaign has no offer', async () => {
      vi.mocked(
        mockCampaignsService.checkFreeTextsEligibility,
      ).mockResolvedValue(false)

      const amount = await service.calculateAmount({
        ...baseMetadata,
        contactCount: 500,
        campaignId: 1,
      })

      expect(amount).toBe(calcTextAmountInCents(500))
    })
  })

  describe('calculateDiscount', () => {
    it('returns 0 for non-p2p outreachType', async () => {
      const discount = await service.calculateDiscount(500, 1, 'text')

      expect(discount).toBe(0)
    })

    it('returns 0 when campaignId is missing', async () => {
      const discount = await service.calculateDiscount(500, undefined, 'p2p')

      expect(discount).toBe(0)
    })

    it('returns 0 when campaign has no offer', async () => {
      vi.mocked(
        mockCampaignsService.checkFreeTextsEligibility,
      ).mockResolvedValue(false)

      const discount = await service.calculateDiscount(500, 1, 'p2p')

      expect(discount).toBe(0)
    })

    it('caps discount at FREE_TEXTS_OFFER.COUNT when contactCount exceeds it', async () => {
      vi.mocked(
        mockCampaignsService.checkFreeTextsEligibility,
      ).mockResolvedValue(true)

      const discount = await service.calculateDiscount(10000, 1, 'p2p')

      expect(discount).toBe(calcTextAmountInCents(FREE_TEXTS_OFFER.COUNT))
    })

    it('discounts actual contactCount when below FREE_TEXTS_OFFER.COUNT', async () => {
      vi.mocked(
        mockCampaignsService.checkFreeTextsEligibility,
      ).mockResolvedValue(true)

      const discount = await service.calculateDiscount(200, 1, 'p2p')

      expect(discount).toBe(calcTextAmountInCents(200))
    })
  })
})
