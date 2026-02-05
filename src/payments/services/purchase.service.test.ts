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
import { StripeService } from 'src/vendors/stripe/services/stripe.service'
import {
  PurchaseType,
  PurchaseHandler,
  PostPurchaseHandler,
  CheckoutSessionPostPurchaseHandler,
} from '../purchase.types'

// Helper to create mock Stripe Response objects
const mockStripeLastResponse = {
  headers: {},
  requestId: 'req_test',
  statusCode: 200,
}

function mockCheckoutSession(
  overrides: Partial<Stripe.Checkout.Session>,
): Stripe.Response<Stripe.Checkout.Session> {
  return {
    id: 'cs_test',
    object: 'checkout.session',
    status: 'complete',
    metadata: {},
    ...overrides,
    lastResponse: mockStripeLastResponse,
  } as Stripe.Response<Stripe.Checkout.Session>
}

function mockPaymentIntent(
  overrides: Partial<Stripe.PaymentIntent>,
): Stripe.Response<Stripe.PaymentIntent> {
  return {
    id: 'pi_test',
    object: 'payment_intent',
    metadata: {},
    ...overrides,
    lastResponse: mockStripeLastResponse,
  } as Stripe.Response<Stripe.PaymentIntent>
}

describe('PurchaseService', () => {
  let service: PurchaseService
  let mockPaymentsService: {
    createPayment: MockedFunction<PaymentsService['createPayment']>
    retrievePayment: MockedFunction<PaymentsService['retrievePayment']>
  }
  let mockStripeService: {
    createCustomCheckoutSession: MockedFunction<
      StripeService['createCustomCheckoutSession']
    >
    retrieveCheckoutSession: MockedFunction<
      StripeService['retrieveCheckoutSession']
    >
    retrievePaymentIntent: MockedFunction<
      StripeService['retrievePaymentIntent']
    >
    updatePaymentIntentMetadata: MockedFunction<
      StripeService['updatePaymentIntentMetadata']
    >
  }
  let mockPostPurchaseHandler: MockedFunction<PostPurchaseHandler<unknown>>
  let mockCheckoutSessionPostPurchaseHandler: MockedFunction<
    CheckoutSessionPostPurchaseHandler<unknown>
  >

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

    mockStripeService = {
      createCustomCheckoutSession: vi.fn(),
      retrieveCheckoutSession: vi.fn(),
      retrievePaymentIntent: vi.fn(),
      updatePaymentIntentMetadata: vi.fn(),
    }

    mockPostPurchaseHandler = vi.fn().mockResolvedValue(undefined)
    mockCheckoutSessionPostPurchaseHandler = vi.fn().mockResolvedValue({
      success: true,
    })

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PurchaseService,
        {
          provide: PaymentsService,
          useValue: mockPaymentsService,
        },
        {
          provide: StripeService,
          useValue: mockStripeService,
        },
      ],
    }).compile()

    service = module.get<PurchaseService>(PurchaseService)
  })

  describe('createPurchaseIntent with zero amount', () => {
    it('should skip Stripe and return synthetic response when amount is 0', async () => {
      // Arrange: Register a handler that returns 0 amount (free texts covers all)
      const mockHandler: PurchaseHandler<unknown> = {
        validatePurchase: vi.fn().mockResolvedValue(undefined),
        calculateAmount: vi.fn().mockResolvedValue(0), // Zero amount!
      }
      service.registerPurchaseHandler(PurchaseType.TEXT, mockHandler)
      service.registerPostPurchaseHandler(
        PurchaseType.TEXT,
        mockPostPurchaseHandler,
      )

      // Act
      const result = await service.createPurchaseIntent({
        user: mockUser,
        dto: {
          type: PurchaseType.TEXT,
          metadata: {
            contactCount: 298, // Less than 5000 free texts
            pricePerContact: 3.5,
            campaignId: 111,
          },
        },
        campaign: mockCampaign,
      })

      // Assert: Should NOT call Stripe
      expect(mockPaymentsService.createPayment).not.toHaveBeenCalled()

      // Assert: Should return synthetic response
      expect(result.id).toMatch(/^free_\d+_1$/)
      expect(result.clientSecret).toBe('')
      expect(result.amount).toBe(0)
      expect(result.status).toBe('succeeded')

      // Assert: Should execute post-purchase handler immediately
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
      // Arrange: Handler returns non-zero amount
      const mockHandler: PurchaseHandler<unknown> = {
        validatePurchase: vi.fn().mockResolvedValue(undefined),
        calculateAmount: vi.fn().mockResolvedValue(1043), // $10.43 in cents
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

      // Act
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

      // Assert: Should call Stripe
      expect(mockPaymentsService.createPayment).toHaveBeenCalledOnce()

      // Assert: Should return Stripe response
      expect(result.id).toBe('pi_test123')
      expect(result.clientSecret).toBe('secret_test123')
      expect(result.amount).toBe(10.43) // Converted from cents
      expect(result.status).toBe('requires_payment_method')

      // Assert: Should NOT execute post-purchase handler during intent creation
      // (post-purchase only runs in completePurchase after payment succeeds)
      expect(mockPostPurchaseHandler).not.toHaveBeenCalled()
    })

    it('should propagate errors from post-purchase handler on zero-amount purchase', async () => {
      // Arrange
      const mockHandler: PurchaseHandler<unknown> = {
        validatePurchase: vi.fn().mockResolvedValue(undefined),
        calculateAmount: vi.fn().mockResolvedValue(0),
      }
      const failingHandler = vi
        .fn()
        .mockRejectedValue(new Error('Failed to redeem free texts'))
      service.registerPurchaseHandler(PurchaseType.TEXT, mockHandler)
      service.registerPostPurchaseHandler(PurchaseType.TEXT, failingHandler)

      // Act & Assert: Error should propagate, not be swallowed
      await expect(
        service.createPurchaseIntent({
          user: mockUser,
          dto: {
            type: PurchaseType.TEXT,
            metadata: { contactCount: 100 },
          },
          campaign: mockCampaign,
        }),
      ).rejects.toThrow('Failed to redeem free texts')
    })
  })

  describe('createCheckoutSession', () => {
    it('should create a checkout session with promo codes enabled', async () => {
      // Arrange
      const mockHandler: PurchaseHandler<unknown> = {
        validatePurchase: vi.fn().mockResolvedValue(undefined),
        calculateAmount: vi.fn().mockResolvedValue(5000), // $50.00 in cents
        getProductName: vi.fn().mockReturnValue('SMS Outreach - 500 texts'),
        getProductDescription: vi.fn().mockReturnValue('Send 500 text messages'),
      }
      service.registerPurchaseHandler(PurchaseType.TEXT, mockHandler)

      mockStripeService.createCustomCheckoutSession.mockResolvedValue({
        id: 'cs_test_abc123',
        clientSecret: 'cs_secret_xyz',
        amount: 50,
      })

      // Act
      const result = await service.createCheckoutSession({
        user: mockUser,
        dto: {
          type: PurchaseType.TEXT,
          metadata: {
            contactCount: 500,
            pricePerContact: 3.5,
          },
        },
        campaign: mockCampaign,
      })

      // Assert
      expect(mockStripeService.createCustomCheckoutSession).toHaveBeenCalledWith(
        mockUser,
        expect.objectContaining({
          purchaseType: PurchaseType.TEXT,
          amount: 5000,
          productName: 'SMS Outreach - 500 texts',
          productDescription: 'Send 500 text messages',
          allowPromoCodes: true,
          metadata: expect.objectContaining({
            contactCount: 500,
            campaignId: 111,
          }),
        }),
      )
      expect(result.id).toBe('cs_test_abc123')
      expect(result.clientSecret).toBe('cs_secret_xyz')
    })

    it('should throw error when no handler is registered', async () => {
      // Act & Assert
      await expect(
        service.createCheckoutSession({
          user: mockUser,
          dto: {
            type: PurchaseType.TEXT,
            metadata: {},
          },
        }),
      ).rejects.toThrow('No handler found for purchase type: TEXT')
    })

    it('should use default product name when handler does not provide one', async () => {
      // Arrange
      const mockHandler: PurchaseHandler<unknown> = {
        validatePurchase: vi.fn().mockResolvedValue(undefined),
        calculateAmount: vi.fn().mockResolvedValue(2500),
        // No getProductName provided
      }
      service.registerPurchaseHandler(PurchaseType.POLL, mockHandler)

      mockStripeService.createCustomCheckoutSession.mockResolvedValue({
        id: 'cs_test_poll',
        clientSecret: 'cs_secret_poll',
        amount: 25,
      })

      // Act
      await service.createCheckoutSession({
        user: mockUser,
        dto: {
          type: PurchaseType.POLL,
          metadata: { pollId: 123 },
        },
      })

      // Assert: Should use default product name
      expect(mockStripeService.createCustomCheckoutSession).toHaveBeenCalledWith(
        mockUser,
        expect.objectContaining({
          productName: 'Poll Credits',
        }),
      )
    })

    it('should skip Stripe and execute post-purchase handler when amount is 0', async () => {
      // Arrange: Handler returns zero amount (free texts offer covers all)
      const mockHandler: PurchaseHandler<unknown> = {
        validatePurchase: vi.fn().mockResolvedValue(undefined),
        calculateAmount: vi.fn().mockResolvedValue(0),
        getProductName: vi.fn().mockReturnValue('SMS Outreach'),
      }
      service.registerPurchaseHandler(PurchaseType.TEXT, mockHandler)
      service.registerCheckoutSessionPostPurchaseHandler(
        PurchaseType.TEXT,
        mockCheckoutSessionPostPurchaseHandler,
      )

      // Act
      const result = await service.createCheckoutSession({
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

      // Assert: Should NOT call Stripe
      expect(
        mockStripeService.createCustomCheckoutSession,
      ).not.toHaveBeenCalled()

      // Assert: Should return synthetic response
      expect(result.id).toMatch(/^free_\d+_1$/)
      expect(result.clientSecret).toBe('')
      expect(result.amount).toBe(0)

      // Assert: Should execute post-purchase handler immediately
      expect(mockCheckoutSessionPostPurchaseHandler).toHaveBeenCalledOnce()
      expect(mockCheckoutSessionPostPurchaseHandler).toHaveBeenCalledWith(
        expect.stringMatching(/^free_\d+_1$/),
        expect.objectContaining({
          contactCount: 298,
          pricePerContact: 3.5,
          campaignId: 111,
          purchaseType: PurchaseType.TEXT,
        }),
      )
    })

    it('should propagate errors from post-purchase handler on zero-amount checkout', async () => {
      // Arrange
      const mockHandler: PurchaseHandler<unknown> = {
        validatePurchase: vi.fn().mockResolvedValue(undefined),
        calculateAmount: vi.fn().mockResolvedValue(0),
      }
      const failingHandler = vi
        .fn()
        .mockRejectedValue(new Error('Failed to redeem free texts'))
      service.registerPurchaseHandler(PurchaseType.TEXT, mockHandler)
      service.registerCheckoutSessionPostPurchaseHandler(
        PurchaseType.TEXT,
        failingHandler,
      )

      // Act & Assert: Error should propagate, not be swallowed
      await expect(
        service.createCheckoutSession({
          user: mockUser,
          dto: {
            type: PurchaseType.TEXT,
            metadata: { contactCount: 100 },
          },
          campaign: mockCampaign,
        }),
      ).rejects.toThrow('Failed to redeem free texts')
    })
  })

  describe('completeCheckoutSession', () => {
    it('should complete checkout session and run post-purchase handler', async () => {
      // Arrange
      const sessionId = 'cs_test_complete'
      service.registerCheckoutSessionPostPurchaseHandler(
        PurchaseType.TEXT,
        mockCheckoutSessionPostPurchaseHandler,
      )

      mockStripeService.retrieveCheckoutSession.mockResolvedValue(
        mockCheckoutSession({
          id: sessionId,
          status: 'complete',
          payment_intent: 'pi_test_payment',
          metadata: {
            purchaseType: PurchaseType.TEXT,
            contactCount: '500',
            userId: '1',
          },
        }),
      )

      mockStripeService.retrievePaymentIntent.mockResolvedValue(
        mockPaymentIntent({
          id: 'pi_test_payment',
          metadata: {}, // No postPurchaseCompletedAt - not yet processed
        }),
      )

      mockStripeService.updatePaymentIntentMetadata.mockResolvedValue(
        mockPaymentIntent({}),
      )

      // Act
      const result = await service.completeCheckoutSession({
        checkoutSessionId: sessionId,
      })

      // Assert
      expect(result.alreadyProcessed).toBe(false)
      expect(mockCheckoutSessionPostPurchaseHandler).toHaveBeenCalledWith(
        sessionId,
        expect.objectContaining({
          purchaseType: PurchaseType.TEXT,
          contactCount: '500',
        }),
      )
      // Should mark as processed after handler succeeds
      expect(mockStripeService.updatePaymentIntentMetadata).toHaveBeenCalledWith(
        'pi_test_payment',
        expect.objectContaining({
          postPurchaseCompletedAt: expect.any(String),
        }),
      )
    })

    it('should skip handler if already processed (idempotency)', async () => {
      // Arrange
      const sessionId = 'cs_test_already_done'
      service.registerCheckoutSessionPostPurchaseHandler(
        PurchaseType.TEXT,
        mockCheckoutSessionPostPurchaseHandler,
      )

      mockStripeService.retrieveCheckoutSession.mockResolvedValue(
        mockCheckoutSession({
          id: sessionId,
          status: 'complete',
          payment_intent: 'pi_test_payment',
          metadata: {
            purchaseType: PurchaseType.TEXT,
          },
        }),
      )

      mockStripeService.retrievePaymentIntent.mockResolvedValue(
        mockPaymentIntent({
          id: 'pi_test_payment',
          metadata: {
            postPurchaseCompletedAt: '2024-01-15T10:00:00.000Z', // Already processed!
          },
        }),
      )

      // Act
      const result = await service.completeCheckoutSession({
        checkoutSessionId: sessionId,
      })

      // Assert
      expect(result.alreadyProcessed).toBe(true)
      expect(mockCheckoutSessionPostPurchaseHandler).not.toHaveBeenCalled()
      expect(mockStripeService.updatePaymentIntentMetadata).not.toHaveBeenCalled()
    })

    it('should throw if session is not complete', async () => {
      // Arrange
      mockStripeService.retrieveCheckoutSession.mockResolvedValue(
        mockCheckoutSession({
          id: 'cs_test_incomplete',
          status: 'open', // Not complete
          metadata: {},
        }),
      )

      // Act & Assert
      await expect(
        service.completeCheckoutSession({
          checkoutSessionId: 'cs_test_incomplete',
        }),
      ).rejects.toThrow('Checkout session not completed: open')
    })

    it('should throw if no purchase type in metadata', async () => {
      // Arrange
      mockStripeService.retrieveCheckoutSession.mockResolvedValue(
        mockCheckoutSession({
          id: 'cs_test_no_type',
          status: 'complete',
          payment_intent: 'pi_test',
          metadata: {}, // No purchaseType!
        }),
      )

      mockStripeService.retrievePaymentIntent.mockResolvedValue(
        mockPaymentIntent({
          id: 'pi_test',
          metadata: {},
        }),
      )

      // Act & Assert
      await expect(
        service.completeCheckoutSession({
          checkoutSessionId: 'cs_test_no_type',
        }),
      ).rejects.toThrow('No purchase type found in session metadata')
    })

    it('should throw if no handler registered for purchase type', async () => {
      // Arrange
      mockStripeService.retrieveCheckoutSession.mockResolvedValue(
        mockCheckoutSession({
          id: 'cs_test_no_handler',
          status: 'complete',
          payment_intent: 'pi_test',
          metadata: {
            purchaseType: PurchaseType.DOMAIN_REGISTRATION,
          },
        }),
      )

      mockStripeService.retrievePaymentIntent.mockResolvedValue(
        mockPaymentIntent({
          id: 'pi_test',
          metadata: {},
        }),
      )

      // No handler registered for DOMAIN_REGISTRATION

      // Act & Assert
      await expect(
        service.completeCheckoutSession({
          checkoutSessionId: 'cs_test_no_handler',
        }),
      ).rejects.toThrow(
        'No checkout session post-purchase handler found for this purchase type',
      )
    })

    it('should NOT mark as processed if handler fails', async () => {
      // Arrange
      const sessionId = 'cs_test_handler_fails'
      const failingHandler = vi
        .fn()
        .mockRejectedValue(new Error('Handler failed'))
      service.registerCheckoutSessionPostPurchaseHandler(
        PurchaseType.TEXT,
        failingHandler,
      )

      mockStripeService.retrieveCheckoutSession.mockResolvedValue(
        mockCheckoutSession({
          id: sessionId,
          status: 'complete',
          payment_intent: 'pi_test_payment',
          metadata: {
            purchaseType: PurchaseType.TEXT,
          },
        }),
      )

      mockStripeService.retrievePaymentIntent.mockResolvedValue(
        mockPaymentIntent({
          id: 'pi_test_payment',
          metadata: {},
        }),
      )

      // Act & Assert
      await expect(
        service.completeCheckoutSession({
          checkoutSessionId: sessionId,
        }),
      ).rejects.toThrow('Handler failed')

      // Should NOT mark as processed since handler failed
      expect(mockStripeService.updatePaymentIntentMetadata).not.toHaveBeenCalled()
    })
  })

  describe('completePurchase (legacy PaymentIntent flow)', () => {
    it('should complete purchase and run post-purchase handler', async () => {
      // Arrange
      service.registerPostPurchaseHandler(
        PurchaseType.TEXT,
        mockPostPurchaseHandler,
      )

      mockPaymentsService.retrievePayment.mockResolvedValue(
        mockPaymentIntent({
          id: 'pi_test_legacy',
          status: 'succeeded',
          metadata: {
            purchaseType: PurchaseType.TEXT,
            contactCount: '1000',
            campaignId: '111',
          },
        }),
      )

      // Act
      await service.completePurchase({
        paymentIntentId: 'pi_test_legacy',
      })

      // Assert
      expect(mockPostPurchaseHandler).toHaveBeenCalledWith(
        'pi_test_legacy',
        expect.objectContaining({
          purchaseType: PurchaseType.TEXT,
          contactCount: '1000',
        }),
      )
    })

    it('should throw if payment not succeeded', async () => {
      // Arrange
      mockPaymentsService.retrievePayment.mockResolvedValue(
        mockPaymentIntent({
          id: 'pi_test_pending',
          status: 'requires_payment_method',
          metadata: { purchaseType: PurchaseType.TEXT },
        }),
      )

      // Act & Assert
      await expect(
        service.completePurchase({ paymentIntentId: 'pi_test_pending' }),
      ).rejects.toThrow('Payment not completed: requires_payment_method')
    })

    it('should throw if no purchase type in metadata', async () => {
      // Arrange
      mockPaymentsService.retrievePayment.mockResolvedValue(
        mockPaymentIntent({
          id: 'pi_test_no_type',
          status: 'succeeded',
          metadata: {}, // No purchaseType!
        }),
      )

      // Act & Assert
      await expect(
        service.completePurchase({ paymentIntentId: 'pi_test_no_type' }),
      ).rejects.toThrow('No purchase type found in payment metadata')
    })

    it('should throw if no handler registered', async () => {
      // Arrange
      mockPaymentsService.retrievePayment.mockResolvedValue(
        mockPaymentIntent({
          id: 'pi_test_no_handler',
          status: 'succeeded',
          metadata: { purchaseType: PurchaseType.DOMAIN_REGISTRATION },
        }),
      )

      // No handler registered for DOMAIN_REGISTRATION

      // Act & Assert
      await expect(
        service.completePurchase({ paymentIntentId: 'pi_test_no_handler' }),
      ).rejects.toThrow('No post-purchase handler found for this purchase type')
    })
  })

  describe('createPurchaseIntent validation', () => {
    it('should throw when handler validation fails', async () => {
      // Arrange
      const mockHandler: PurchaseHandler<unknown> = {
        validatePurchase: vi
          .fn()
          .mockRejectedValue(new Error('Domain already registered')),
        calculateAmount: vi.fn().mockResolvedValue(3500),
      }
      service.registerPurchaseHandler(
        PurchaseType.DOMAIN_REGISTRATION,
        mockHandler,
      )

      // Act & Assert
      await expect(
        service.createPurchaseIntent({
          user: mockUser,
          dto: {
            type: PurchaseType.DOMAIN_REGISTRATION,
            metadata: { domainName: 'taken.com', websiteId: 1 },
          },
        }),
      ).rejects.toThrow('Domain already registered')

      expect(mockPaymentsService.createPayment).not.toHaveBeenCalled()
    })
  })

  describe('completeCheckoutSession without payment_intent', () => {
    it('should still run handler but skip metadata update when no payment_intent', async () => {
      // Arrange: Session has no payment_intent (unusual but possible)
      const sessionId = 'cs_no_payment_intent'
      service.registerCheckoutSessionPostPurchaseHandler(
        PurchaseType.TEXT,
        mockCheckoutSessionPostPurchaseHandler,
      )

      mockStripeService.retrieveCheckoutSession.mockResolvedValue(
        mockCheckoutSession({
          id: sessionId,
          status: 'complete',
          payment_intent: null, // No payment intent!
          metadata: {
            purchaseType: PurchaseType.TEXT,
            contactCount: '100',
          },
        }),
      )

      // Act
      const result = await service.completeCheckoutSession({
        checkoutSessionId: sessionId,
      })

      // Assert: Handler should run
      expect(result.alreadyProcessed).toBe(false)
      expect(mockCheckoutSessionPostPurchaseHandler).toHaveBeenCalledWith(
        sessionId,
        expect.objectContaining({
          purchaseType: PurchaseType.TEXT,
        }),
      )

      // Assert: Should NOT try to retrieve or update PaymentIntent
      expect(mockStripeService.retrievePaymentIntent).not.toHaveBeenCalled()
      expect(
        mockStripeService.updatePaymentIntentMetadata,
      ).not.toHaveBeenCalled()
    })
  })
})
