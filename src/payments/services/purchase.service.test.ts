import { Test, TestingModule } from '@nestjs/testing'
import { User, Campaign } from '@prisma/client'
import Stripe from 'stripe'
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockedFunction,
} from 'vitest'
import { PurchaseService } from './purchase.service'
import { PaymentsService } from './payments.service'
import {
  PurchaseType,
  PurchaseHandler,
  PostPurchaseHandler,
} from '../purchase.types'

describe('PurchaseService', () => {
  let service: PurchaseService
  let mockPaymentsService: {
    createPayment: MockedFunction<PaymentsService['createPayment']>
    retrievePayment: MockedFunction<PaymentsService['retrievePayment']>
  }
  let mockPostPurchaseHandler: MockedFunction<PostPurchaseHandler<unknown>>

  const mockUser: User = {
    id: 1,
    email: 'test@example.com',
    firstName: 'Test',
    lastName: 'User',
    name: 'Test User',
    phone: '1234567890',
    zip: '12345',
    createdAt: new Date(),
    updatedAt: new Date(),
    avatar: null,
    password: null,
    hasPassword: false,
    roles: [],
    metaData: null,
    passwordResetToken: null,
  }

  const mockCampaign: Campaign = {
    id: 111,
    slug: 'test-campaign',
    createdAt: new Date(),
    updatedAt: new Date(),
    isActive: true,
    isVerified: true,
    isPro: true,
    isDemo: false,
    didWin: null,
    dateVerified: null,
    tier: null,
    formattedAddress: null,
    placeId: null,
    data: {},
    details: {},
    aiContent: {},
    vendorTsData: {},
    userId: 1,
    canDownloadFederal: false,
    completedTaskIds: [],
    hasFreeTextsOffer: true,
    freeTextsOfferRedeemedAt: null,
  }

  beforeEach(async () => {
    mockPaymentsService = {
      createPayment: vi.fn(),
      retrievePayment: vi.fn(),
    }

    mockPostPurchaseHandler = vi.fn().mockResolvedValue(undefined)

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PurchaseService,
        {
          provide: PaymentsService,
          useValue: mockPaymentsService,
        },
      ],
    }).compile()

    service = module.get<PurchaseService>(PurchaseService)
  })

  describe('createPurchaseIntent with zero amount', () => {
    it('should skip Stripe and return synthetic response when amount is 0', async () => {
      const mockHandler: PurchaseHandler<unknown> = {
        validatePurchase: vi.fn().mockResolvedValue(undefined),
        calculateAmount: vi.fn().mockResolvedValue(0),
      }
      service.registerPurchaseHandler(PurchaseType.TEXT, mockHandler)
      service.registerPostPurchaseHandler(
        PurchaseType.TEXT,
        mockPostPurchaseHandler,
      )

      const result = await service.createPurchaseIntent({
        user: mockUser,
        dto: {
          type: PurchaseType.TEXT,
          metadata: {
            contactCount: 298,
            pricePerContact: 3.5,
            campaignId: 111,
          },
        },
        campaign: mockCampaign,
      })

      expect(mockPaymentsService.createPayment).not.toHaveBeenCalled()
      expect(result.id).toMatch(/^free_\d+_1$/)
      expect(result.clientSecret).toBe('')
      expect(result.amount).toBe(0)
      expect(result.status).toBe('succeeded')
      expect(mockPostPurchaseHandler).toHaveBeenCalledOnce()
      expect(mockPostPurchaseHandler).toHaveBeenCalledWith(
        expect.stringMatching(/^free_\d+_1$/),
        expect.objectContaining({
          contactCount: 298,
          pricePerContact: 3.5,
          campaignId: 111,
          purchaseType: PurchaseType.TEXT,
        }),
      )
    })

    it('should call Stripe when amount is greater than 0', async () => {
      const mockHandler: PurchaseHandler<unknown> = {
        validatePurchase: vi.fn().mockResolvedValue(undefined),
        calculateAmount: vi.fn().mockResolvedValue(1043),
      }
      mockPaymentsService.createPayment.mockResolvedValue({
        id: 'pi_test123',
        client_secret: 'secret_test123',
        amount: 1043,
        status: 'requires_payment_method',
        lastResponse: {
          headers: {},
          requestId: 'req_test123',
          statusCode: 200,
        },
      } as Stripe.Response<Stripe.PaymentIntent>)

      service.registerPurchaseHandler(PurchaseType.TEXT, mockHandler)
      service.registerPostPurchaseHandler(
        PurchaseType.TEXT,
        mockPostPurchaseHandler,
      )

      const result = await service.createPurchaseIntent({
        user: mockUser,
        dto: {
          type: PurchaseType.TEXT,
          metadata: {
            contactCount: 5500,
            pricePerContact: 3.5,
            campaignId: 111,
          },
        },
        campaign: mockCampaign,
      })

      expect(mockPaymentsService.createPayment).toHaveBeenCalledOnce()
      expect(result.id).toBe('pi_test123')
      expect(result.clientSecret).toBe('secret_test123')
      expect(result.amount).toBe(10.43)
      expect(result.status).toBe('requires_payment_method')
      expect(mockPostPurchaseHandler).not.toHaveBeenCalled()
    })
  })

  describe('createPurchaseIntent - handler validation', () => {
    it('should throw when no handler is registered for purchase type', async () => {
      await expect(
        service.createPurchaseIntent({
          user: mockUser,
          dto: {
            type: PurchaseType.DOMAIN_REGISTRATION,
            metadata: { domainName: 'example.com' },
          },
        }),
      ).rejects.toThrow(
        'No handler found for purchase type: DOMAIN_REGISTRATION',
      )
    })

    it('should reuse existing payment intent from validatePurchase', async () => {
      const existingPI = {
        id: 'pi_existing',
        client_secret: 'secret_existing',
        amount: 500,
        status: 'requires_payment_method' as Stripe.PaymentIntent.Status,
        lastResponse: {
          headers: {},
          requestId: 'req_existing',
          statusCode: 200,
        },
      } as Stripe.Response<Stripe.PaymentIntent>

      const mockHandler: PurchaseHandler<unknown> = {
        validatePurchase: vi.fn().mockResolvedValue(existingPI),
        calculateAmount: vi.fn().mockResolvedValue(500),
      }
      service.registerPurchaseHandler(
        PurchaseType.DOMAIN_REGISTRATION,
        mockHandler,
      )

      const result = await service.createPurchaseIntent({
        user: mockUser,
        dto: {
          type: PurchaseType.DOMAIN_REGISTRATION,
          metadata: { domainName: 'example.com' },
        },
      })

      expect(mockPaymentsService.createPayment).not.toHaveBeenCalled()
      expect(result.id).toBe('pi_existing')
    })
  })

  describe('completePurchase', () => {
    it('should throw when payment status is not succeeded', async () => {
      mockPaymentsService.retrievePayment.mockResolvedValue({
        id: 'pi_test',
        status: 'requires_payment_method',
        metadata: { purchaseType: PurchaseType.TEXT },
      } as unknown as Stripe.Response<Stripe.PaymentIntent>)

      await expect(
        service.completePurchase({ paymentIntentId: 'pi_test' }),
      ).rejects.toThrow('Payment not completed: requires_payment_method')
    })

    it('should throw when no purchaseType in metadata', async () => {
      mockPaymentsService.retrievePayment.mockResolvedValue({
        id: 'pi_test',
        status: 'succeeded',
        metadata: {},
      } as unknown as Stripe.Response<Stripe.PaymentIntent>)

      await expect(
        service.completePurchase({ paymentIntentId: 'pi_test' }),
      ).rejects.toThrow('No purchase type found in payment metadata')
    })

    it('should throw when no post-purchase handler registered', async () => {
      mockPaymentsService.retrievePayment.mockResolvedValue({
        id: 'pi_test',
        status: 'succeeded',
        metadata: { purchaseType: PurchaseType.POLL },
      } as unknown as Stripe.Response<Stripe.PaymentIntent>)

      await expect(
        service.completePurchase({ paymentIntentId: 'pi_test' }),
      ).rejects.toThrow(
        'No post-purchase handler found for this purchase type',
      )
    })

    it('should execute post-purchase handler with payment metadata', async () => {
      const metadata = {
        purchaseType: PurchaseType.TEXT,
        contactCount: '500',
        campaignId: '111',
      }
      mockPaymentsService.retrievePayment.mockResolvedValue({
        id: 'pi_test',
        status: 'succeeded',
        metadata,
      } as unknown as Stripe.Response<Stripe.PaymentIntent>)

      service.registerPostPurchaseHandler(
        PurchaseType.TEXT,
        mockPostPurchaseHandler,
      )

      await service.completePurchase({ paymentIntentId: 'pi_test' })

      expect(mockPostPurchaseHandler).toHaveBeenCalledOnce()
      expect(mockPostPurchaseHandler).toHaveBeenCalledWith('pi_test', metadata)
    })

    it('should NOT be idempotent - calling twice executes handler twice (anti-pattern gap)', async () => {
      // This test documents that completePurchase has no idempotency protection.
      // If both the client AND webhook call completePurchase, the handler runs twice.
      // This is the core anti-pattern: domain logic should only run via webhook.
      const metadata = {
        purchaseType: PurchaseType.TEXT,
        contactCount: '500',
      }
      mockPaymentsService.retrievePayment.mockResolvedValue({
        id: 'pi_test',
        status: 'succeeded',
        metadata,
      } as unknown as Stripe.Response<Stripe.PaymentIntent>)

      service.registerPostPurchaseHandler(
        PurchaseType.TEXT,
        mockPostPurchaseHandler,
      )

      // First call (e.g., from client endpoint)
      await service.completePurchase({ paymentIntentId: 'pi_test' })
      // Second call (e.g., from webhook)
      await service.completePurchase({ paymentIntentId: 'pi_test' })

      // GAP: Handler executes twice with no idempotency guard
      expect(mockPostPurchaseHandler).toHaveBeenCalledTimes(2)
    })

    it('should propagate errors from post-purchase handler', async () => {
      mockPaymentsService.retrievePayment.mockResolvedValue({
        id: 'pi_test',
        status: 'succeeded',
        metadata: { purchaseType: PurchaseType.DOMAIN_REGISTRATION },
      } as unknown as Stripe.Response<Stripe.PaymentIntent>)

      const failingHandler = vi
        .fn()
        .mockRejectedValue(new Error('Domain registration failed'))
      service.registerPostPurchaseHandler(
        PurchaseType.DOMAIN_REGISTRATION,
        failingHandler,
      )

      await expect(
        service.completePurchase({ paymentIntentId: 'pi_test' }),
      ).rejects.toThrow('Domain registration failed')
    })
  })

  describe('registerPurchaseHandler', () => {
    it('should register and retrieve handlers by purchase type', async () => {
      const handlerA: PurchaseHandler<unknown> = {
        validatePurchase: vi.fn().mockResolvedValue(undefined),
        calculateAmount: vi.fn().mockResolvedValue(100),
      }
      const handlerB: PurchaseHandler<unknown> = {
        validatePurchase: vi.fn().mockResolvedValue(undefined),
        calculateAmount: vi.fn().mockResolvedValue(200),
      }

      service.registerPurchaseHandler(PurchaseType.TEXT, handlerA)
      service.registerPurchaseHandler(PurchaseType.POLL, handlerB)

      mockPaymentsService.createPayment.mockResolvedValue({
        id: 'pi_1',
        client_secret: 's1',
        amount: 100,
        status: 'requires_payment_method',
        lastResponse: { headers: {}, requestId: 'r', statusCode: 200 },
      } as Stripe.Response<Stripe.PaymentIntent>)

      await service.createPurchaseIntent({
        user: mockUser,
        dto: { type: PurchaseType.TEXT, metadata: {} },
      })

      expect(handlerA.calculateAmount).toHaveBeenCalledOnce()
      expect(handlerB.calculateAmount).not.toHaveBeenCalled()
    })

    it('should allow overriding a handler for the same purchase type', async () => {
      const originalHandler: PurchaseHandler<unknown> = {
        validatePurchase: vi.fn().mockResolvedValue(undefined),
        calculateAmount: vi.fn().mockResolvedValue(100),
      }
      const replacementHandler: PurchaseHandler<unknown> = {
        validatePurchase: vi.fn().mockResolvedValue(undefined),
        calculateAmount: vi.fn().mockResolvedValue(999),
      }

      service.registerPurchaseHandler(PurchaseType.TEXT, originalHandler)
      service.registerPurchaseHandler(PurchaseType.TEXT, replacementHandler)

      mockPaymentsService.createPayment.mockResolvedValue({
        id: 'pi_1',
        client_secret: 's1',
        amount: 999,
        status: 'requires_payment_method',
        lastResponse: { headers: {}, requestId: 'r', statusCode: 200 },
      } as Stripe.Response<Stripe.PaymentIntent>)

      await service.createPurchaseIntent({
        user: mockUser,
        dto: { type: PurchaseType.TEXT, metadata: {} },
      })

      expect(originalHandler.calculateAmount).not.toHaveBeenCalled()
      expect(replacementHandler.calculateAmount).toHaveBeenCalledOnce()
    })
  })

  describe('zero-amount edge cases', () => {
    it('should still return success even if no post-purchase handler is registered for free purchase', async () => {
      const mockHandler: PurchaseHandler<unknown> = {
        validatePurchase: vi.fn().mockResolvedValue(undefined),
        calculateAmount: vi.fn().mockResolvedValue(0),
      }
      service.registerPurchaseHandler(PurchaseType.TEXT, mockHandler)
      // NOTE: deliberately NOT registering a post-purchase handler

      const result = await service.createPurchaseIntent({
        user: mockUser,
        dto: { type: PurchaseType.TEXT, metadata: {} },
      })

      expect(result.status).toBe('succeeded')
      expect(result.amount).toBe(0)
    })

    it('should not throw if post-purchase handler fails for free purchase', async () => {
      const mockHandler: PurchaseHandler<unknown> = {
        validatePurchase: vi.fn().mockResolvedValue(undefined),
        calculateAmount: vi.fn().mockResolvedValue(0),
      }
      const failingHandler = vi
        .fn()
        .mockRejectedValue(new Error('Handler failed'))

      service.registerPurchaseHandler(PurchaseType.TEXT, mockHandler)
      service.registerPostPurchaseHandler(PurchaseType.TEXT, failingHandler)

      // Should NOT throw - free purchase handler failures are caught
      const result = await service.createPurchaseIntent({
        user: mockUser,
        dto: { type: PurchaseType.TEXT, metadata: {} },
      })

      expect(result.status).toBe('succeeded')
      expect(failingHandler).toHaveBeenCalledOnce()
    })
  })
})
