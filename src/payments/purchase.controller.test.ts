import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import {
  createMockCampaign,
  createMockUser,
} from '@/shared/test-utils/mockData.util'
import { BadRequestException } from '@nestjs/common'
import { Campaign } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CampaignsService } from '../campaigns/services/campaigns.service'
import { UsersService } from '../users/services/users.service'
import { StripeService } from '../vendors/stripe/services/stripe.service'
import { PurchaseController } from './purchase.controller'
import { PurchaseService } from './services/purchase.service'

describe('PurchaseController.createProCheckoutSession', () => {
  let controller: PurchaseController
  let stripeService: { createCheckoutSession: ReturnType<typeof vi.fn> }
  let usersService: { patchUserMetaData: ReturnType<typeof vi.fn> }
  let campaignsService: { findByUserId: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    stripeService = {
      createCheckoutSession: vi.fn().mockResolvedValue({
        redirectUrl: 'https://stripe.test/checkout',
        checkoutSessionId: 'cs_test_123',
      }),
    }
    usersService = { patchUserMetaData: vi.fn().mockResolvedValue(undefined) }
    campaignsService = { findByUserId: vi.fn() }

    controller = new PurchaseController(
      stripeService as unknown as StripeService,
      usersService as unknown as UsersService,
      campaignsService as unknown as CampaignsService,
      {} as PurchaseService,
      createMockLogger(),
    )
  })

  const formatYmd = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const futureDate = () => {
    const d = new Date()
    d.setFullYear(d.getFullYear() + 1)
    return formatYmd(d)
  }
  const pastDate = () => {
    const d = new Date()
    d.setFullYear(d.getFullYear() - 1)
    return formatYmd(d)
  }
  const today = () => formatYmd(new Date())

  it('creates a checkout session when election date is in the future', async () => {
    const campaign: Campaign = createMockCampaign({
      details: { electionDate: futureDate() },
    })
    campaignsService.findByUserId.mockResolvedValue(campaign)
    const user = createMockUser()

    const result = await controller.createProCheckoutSession(user)

    expect(result).toEqual({ redirectUrl: 'https://stripe.test/checkout' })
    expect(stripeService.createCheckoutSession).toHaveBeenCalledWith(
      user.id,
      user.email,
    )
    expect(usersService.patchUserMetaData).toHaveBeenCalledWith(user.id, {
      checkoutSessionId: 'cs_test_123',
    })
  })

  it('creates a checkout session when election date is today', async () => {
    const campaign: Campaign = createMockCampaign({
      details: { electionDate: today() },
    })
    campaignsService.findByUserId.mockResolvedValue(campaign)
    const user = createMockUser()

    await controller.createProCheckoutSession(user)

    expect(stripeService.createCheckoutSession).toHaveBeenCalledWith(
      user.id,
      user.email,
    )
  })

  it('throws CAMPAIGN_NOT_FOUND when user has no campaign', async () => {
    campaignsService.findByUserId.mockResolvedValue(null)
    const user = createMockUser()

    await expect(controller.createProCheckoutSession(user)).rejects.toThrow(
      BadRequestException,
    )
    try {
      await controller.createProCheckoutSession(user)
    } catch (e) {
      expect((e as BadRequestException).getResponse()).toMatchObject({
        errorCode: 'CAMPAIGN_NOT_FOUND',
      })
    }
    expect(stripeService.createCheckoutSession).not.toHaveBeenCalled()
  })

  it('throws CAMPAIGN_ELECTION_DATE_INVALID when electionDate is missing', async () => {
    campaignsService.findByUserId.mockResolvedValue(
      createMockCampaign({ details: {} }),
    )
    const user = createMockUser()

    try {
      await controller.createProCheckoutSession(user)
      expect.fail('expected throw')
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestException)
      expect((e as BadRequestException).getResponse()).toMatchObject({
        errorCode: 'CAMPAIGN_ELECTION_DATE_INVALID',
      })
    }
    expect(stripeService.createCheckoutSession).not.toHaveBeenCalled()
  })

  it('throws CAMPAIGN_ELECTION_DATE_INVALID when electionDate is in the past', async () => {
    campaignsService.findByUserId.mockResolvedValue(
      createMockCampaign({ details: { electionDate: pastDate() } }),
    )
    const user = createMockUser()

    try {
      await controller.createProCheckoutSession(user)
      expect.fail('expected throw')
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestException)
      expect((e as BadRequestException).getResponse()).toMatchObject({
        errorCode: 'CAMPAIGN_ELECTION_DATE_INVALID',
      })
    }
    expect(stripeService.createCheckoutSession).not.toHaveBeenCalled()
    expect(usersService.patchUserMetaData).not.toHaveBeenCalled()
  })
})
