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

describe('PurchaseService - Zero Amount Purchases', () => {
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
  })
})
