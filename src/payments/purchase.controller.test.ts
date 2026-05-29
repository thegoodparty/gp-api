import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import { BadRequestException } from '@nestjs/common'
import { Campaign, Organization, User, UserRole } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UsersService } from '../users/services/users.service'
import { StripeService } from '../vendors/stripe/services/stripe.service'
import { PurchaseController } from './purchase.controller'
import {
  CompleteCheckoutSessionDto,
  CompleteFreePurchaseDto,
  CreateCheckoutSessionDto,
  PurchaseType,
} from './purchase.types'
import { PurchaseService } from './services/purchase.service'

const userId = 7

const mockUser: User = {
  id: userId,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  firstName: 'Test',
  lastName: 'User',
  name: 'Test User',
  avatar: null,
  password: null,
  hasPassword: false,
  email: 'buyer@example.com',
  phone: '5555555555',
  zip: '12345',
  roles: [UserRole.candidate],
  metaData: null,
  passwordResetToken: null,
  clerkId: null,
}

const mockCampaign = { id: 111, slug: 'cmp' } as unknown as Campaign
const mockOrganization = { slug: 'org-slug' } as unknown as Organization

describe('PurchaseController', () => {
  let controller: PurchaseController
  let stripeService: {
    createCheckoutSession: ReturnType<typeof vi.fn>
    createPortalSession: ReturnType<typeof vi.fn>
  }
  let usersService: { patchUserMetaData: ReturnType<typeof vi.fn> }
  let purchaseService: {
    createCheckoutSession: ReturnType<typeof vi.fn>
    completeCheckoutSession: ReturnType<typeof vi.fn>
    completeFreePurchase: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    stripeService = {
      createCheckoutSession: vi.fn(),
      createPortalSession: vi.fn(),
    }
    usersService = { patchUserMetaData: vi.fn() }
    purchaseService = {
      createCheckoutSession: vi.fn(),
      completeCheckoutSession: vi.fn(),
      completeFreePurchase: vi.fn(),
    }

    controller = new PurchaseController(
      stripeService as unknown as StripeService,
      usersService as unknown as UsersService,
      purchaseService as unknown as PurchaseService,
      createMockLogger(),
    )
  })

  describe('createProCheckoutSession', () => {
    it('creates the session and persists checkoutSessionId on the user', async () => {
      stripeService.createCheckoutSession.mockResolvedValue({
        redirectUrl: 'https://stripe.test/checkout',
        checkoutSessionId: 'cs_test_123',
      })

      const result = await controller.createProCheckoutSession(mockUser)

      expect(stripeService.createCheckoutSession).toHaveBeenCalledWith(
        userId,
        mockUser.email,
      )
      expect(usersService.patchUserMetaData).toHaveBeenCalledWith(userId, {
        checkoutSessionId: 'cs_test_123',
      })
      expect(result).toEqual({ redirectUrl: 'https://stripe.test/checkout' })
    })
  })

  describe('createPortalSession', () => {
    it('throws BadRequestException when the user has no customerId', async () => {
      await expect(controller.createPortalSession(mockUser)).rejects.toThrow(
        BadRequestException,
      )
      expect(stripeService.createPortalSession).not.toHaveBeenCalled()
    })

    it('returns the portal redirect URL when a customerId exists', async () => {
      const userWithCustomer: User = {
        ...mockUser,
        metaData: { customerId: 'cus_123' },
      }
      stripeService.createPortalSession.mockResolvedValue({
        url: 'https://stripe.test/portal',
      })

      const result = await controller.createPortalSession(userWithCustomer)

      expect(stripeService.createPortalSession).toHaveBeenCalledWith('cus_123')
      expect(result).toEqual({ redirectUrl: 'https://stripe.test/portal' })
    })
  })

  describe('createCheckoutSession', () => {
    const dto: CreateCheckoutSessionDto<unknown> = {
      type: PurchaseType.TEXT,
      metadata: { contactCount: 100 },
    }

    it('throws BadRequestException when neither campaign nor organization is supplied', async () => {
      await expect(
        controller.createCheckoutSession(mockUser, dto, undefined, undefined),
      ).rejects.toThrow(BadRequestException)
      expect(purchaseService.createCheckoutSession).not.toHaveBeenCalled()
    })

    it('forwards campaignId and organizationSlug to the purchase service', async () => {
      const expected = {
        id: 'cs_x',
        clientSecret: 'cs_secret',
        amount: 50,
      }
      purchaseService.createCheckoutSession.mockResolvedValue(expected)

      const result = await controller.createCheckoutSession(
        mockUser,
        dto,
        mockCampaign,
        mockOrganization,
      )

      expect(purchaseService.createCheckoutSession).toHaveBeenCalledWith({
        user: mockUser,
        dto,
        metadata: {
          campaignId: mockCampaign.id,
          organizationSlug: mockOrganization.slug,
        },
      })
      expect(result).toBe(expected)
    })

    it('logs and rethrows errors from the purchase service', async () => {
      const error = new Error('boom')
      purchaseService.createCheckoutSession.mockRejectedValue(error)

      await expect(
        controller.createCheckoutSession(
          mockUser,
          dto,
          mockCampaign,
          undefined,
        ),
      ).rejects.toBe(error)
    })
  })

  describe('completeCheckoutSession', () => {
    it('delegates to PurchaseService.completeCheckoutSession', async () => {
      const dto: CompleteCheckoutSessionDto = {
        checkoutSessionId: 'cs_complete',
      }
      const response = { alreadyProcessed: false, result: { ok: true } }
      purchaseService.completeCheckoutSession.mockResolvedValue(response)

      await expect(controller.completeCheckoutSession(dto)).resolves.toBe(
        response,
      )
      expect(purchaseService.completeCheckoutSession).toHaveBeenCalledWith(dto)
    })
  })

  describe('completeFreePurchase', () => {
    const dto: CompleteFreePurchaseDto = {
      purchaseType: PurchaseType.TEXT,
      metadata: { campaignId: 111 },
    }

    it('forwards user, dto, and campaign to the purchase service', async () => {
      const response = { result: { ok: true } }
      purchaseService.completeFreePurchase.mockResolvedValue(response)

      const result = await controller.completeFreePurchase(
        mockUser,
        dto,
        mockCampaign,
      )

      expect(purchaseService.completeFreePurchase).toHaveBeenCalledWith({
        dto,
        campaign: mockCampaign,
        user: mockUser,
      })
      expect(result).toBe(response)
    })

    it('logs and rethrows errors from the purchase service', async () => {
      const error = new Error('boom')
      purchaseService.completeFreePurchase.mockRejectedValue(error)

      await expect(
        controller.completeFreePurchase(mockUser, dto, mockCampaign),
      ).rejects.toBe(error)
    })
  })
})
