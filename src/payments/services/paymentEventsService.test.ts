import { Test, TestingModule } from '@nestjs/testing'
import Stripe from 'stripe'
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockedFunction,
} from 'vitest'
import { PaymentEventsService } from './paymentEventsService'
import { StripeService } from '../../vendors/stripe/services/stripe.service'
import { CampaignsService } from '../../campaigns/services/campaigns.service'
import { UsersService } from '../../users/services/users.service'
import { SlackService } from '../../vendors/slack/services/slack.service'
import { EmailService } from '../../email/email.service'
import { CrmCampaignsService } from '../../campaigns/services/crmCampaigns.service'
import { VoterFileDownloadAccessService } from '../../shared/services/voterFileDownloadAccess.service'
import { AnalyticsService } from 'src/analytics/analytics.service'
import { WebhookEventType } from '../payments.types'
import { createMockLogger } from '../../shared/test-utils/mockLogger.util'

describe('PaymentEventsService', () => {
  let service: PaymentEventsService

  const mockUsersService = {
    findUser: vi.fn(),
    findByCustomerId: vi.fn(),
    findByCampaign: vi.fn(),
    patchUserMetaData: vi.fn(),
  }
  const mockCampaignsService = {
    findByUserId: vi.fn(),
    findBySubscriptionId: vi.fn(),
    update: vi.fn(),
    patchCampaignDetails: vi.fn(),
    setIsPro: vi.fn(),
    persistCampaignProCancellation: vi.fn(),
  }
  const mockSlackService = { message: vi.fn() }
  const mockEmailService = {
    sendTemplateEmail: vi.fn(),
    sendCancellationRequestConfirmationEmail: vi.fn(),
  }
  const mockCrmService = { getCrmCompanyOwnerName: vi.fn() }
  const mockVoterFileService = { downloadAccessAlert: vi.fn() }
  const mockStripeService = {
    retrievePaymentIntent: vi.fn(),
    updatePaymentIntentMetadata: vi.fn(),
    retrieveCheckoutSession: vi.fn(),
  }
  const mockAnalyticsService = { trackProPayment: vi.fn() }

  beforeEach(async () => {
    vi.clearAllMocks()

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentEventsService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: CampaignsService, useValue: mockCampaignsService },
        { provide: SlackService, useValue: mockSlackService },
        { provide: EmailService, useValue: mockEmailService },
        { provide: CrmCampaignsService, useValue: mockCrmService },
        {
          provide: VoterFileDownloadAccessService,
          useValue: mockVoterFileService,
        },
        { provide: StripeService, useValue: mockStripeService },
        { provide: AnalyticsService, useValue: mockAnalyticsService },
      ],
    }).compile()

    service = module.get<PaymentEventsService>(PaymentEventsService)

    const mockLogger = createMockLogger()
    Object.defineProperty(service, 'logger', {
      get: () => mockLogger,
      configurable: true,
    })
  })

  describe('handleEvent routing', () => {
    it('should route checkout.session.completed events', async () => {
      const spy = vi
        .spyOn(service, 'checkoutSessionCompletedHandler')
        .mockResolvedValue(undefined)

      const event = {
        type: WebhookEventType.CheckoutSessionCompleted,
        data: { object: {} },
      } as Stripe.CheckoutSessionCompletedEvent

      await service.handleEvent(event)
      expect(spy).toHaveBeenCalledWith(event)
    })

    it('should route checkout.session.expired events', async () => {
      const spy = vi
        .spyOn(service, 'checkoutSessionExpiredHandler')
        .mockResolvedValue(undefined)

      const event = {
        type: WebhookEventType.CheckoutSessionExpired,
        data: { object: { metadata: { userId: '1' } } },
      } as unknown as Stripe.CheckoutSessionExpiredEvent

      await service.handleEvent(event)
      expect(spy).toHaveBeenCalledWith(event)
    })

    it('should log warning for unhandled event types', async () => {
      const event = {
        type: 'some.unknown.event',
        data: { object: {} },
      } as unknown as Stripe.Event

      // Should not throw
      await service.handleEvent(event)
    })

    it('should NOT handle payment_intent.succeeded events (gap: missing webhook handler)', () => {
      // GAP: There is no handler for payment_intent.succeeded in handleEvent().
      // This means PaymentIntent-based purchases (domains, polls, texts) have
      // NO webhook-driven post-purchase processing.
      //
      // The only way domain logic runs is via the client calling
      // POST /payments/purchase/complete, which is the anti-pattern.
      //
      // To fix: Add WebhookEventType.PaymentIntentSucceeded and a handler
      // that calls executePostPurchaseHandler().
      const handledEventTypes = [
        WebhookEventType.CustomerSubscriptionCreated,
        WebhookEventType.CheckoutSessionCompleted,
        WebhookEventType.CheckoutSessionExpired,
        WebhookEventType.CustomerSubscriptionDeleted,
        WebhookEventType.CustomerSubscriptionUpdated,
        WebhookEventType.CustomerSubscriptionResumed,
      ]

      expect(handledEventTypes).not.toContain('payment_intent.succeeded')
      expect(Object.values(WebhookEventType)).not.toContain(
        'payment_intent.succeeded',
      )
    })
  })

  describe('checkoutSessionCompletedHandler', () => {
    it('should NOT route one-time payments differently from subscriptions (gap: missing mode routing)', async () => {
      // GAP: The current handler assumes ALL checkout sessions are subscriptions.
      // It doesn't check session.mode to differentiate between 'subscription'
      // and 'payment' modes.
      //
      // A one-time payment checkout session (e.g., domain purchase) will fail
      // because it tries to treat it like a Pro subscription.
      //
      // To fix: Check session.mode and route to different handlers.
      const oneTimePaymentSession = {
        type: WebhookEventType.CheckoutSessionCompleted,
        data: {
          object: {
            mode: 'payment', // One-time payment, NOT subscription
            customer: 'cus_123',
            metadata: {
              userId: '1',
              purchaseType: 'DOMAIN_REGISTRATION',
            },
            payment_intent: 'pi_123',
          },
        },
      } as unknown as Stripe.CheckoutSessionCompletedEvent

      const mockUser = {
        id: 1,
        email: 'test@test.com',
        firstName: 'Test',
        lastName: 'User',
      }
      const mockCampaign = {
        id: 111,
        slug: 'test',
        details: { electionDate: '2026-11-03' },
      }

      mockUsersService.findUser.mockResolvedValue(mockUser)
      mockCampaignsService.findByUserId.mockResolvedValue(mockCampaign)

      // The handler will try to treat this as a subscription checkout
      // and call setIsPro, which is incorrect for one-time payments.
      await service.checkoutSessionCompletedHandler(oneTimePaymentSession)

      // GAP: setIsPro should NOT be called for one-time payment checkouts
      expect(mockCampaignsService.setIsPro).toHaveBeenCalled()
    })

    it('should process Pro subscription checkout correctly', async () => {
      const subscriptionSession = {
        type: WebhookEventType.CheckoutSessionCompleted,
        data: {
          object: {
            id: 'cs_sub_123',
            mode: 'subscription',
            customer: 'cus_123',
            subscription: 'sub_123',
            metadata: { userId: '1' },
          },
        },
      } as unknown as Stripe.CheckoutSessionCompletedEvent

      const mockUser = {
        id: 1,
        email: 'test@test.com',
        firstName: 'Test',
        lastName: 'User',
      }
      const futureDate = new Date()
      futureDate.setFullYear(futureDate.getFullYear() + 1)
      const mockCampaign = {
        id: 111,
        slug: 'test',
        details: { electionDate: futureDate.toISOString() },
        data: {},
      }

      mockUsersService.findUser.mockResolvedValue(mockUser)
      mockCampaignsService.findByUserId.mockResolvedValue(mockCampaign)
      mockUsersService.patchUserMetaData.mockResolvedValue(undefined)
      mockCampaignsService.patchCampaignDetails.mockResolvedValue(undefined)
      mockCampaignsService.setIsPro.mockResolvedValue(undefined)
      mockAnalyticsService.trackProPayment.mockResolvedValue(undefined)
      mockSlackService.message.mockResolvedValue(undefined)
      mockEmailService.sendTemplateEmail.mockResolvedValue(undefined)
      mockVoterFileService.downloadAccessAlert.mockResolvedValue(undefined)

      await service.checkoutSessionCompletedHandler(subscriptionSession)

      expect(mockCampaignsService.patchCampaignDetails).toHaveBeenCalledWith(
        111,
        { subscriptionId: 'sub_123' },
      )
      expect(mockCampaignsService.setIsPro).toHaveBeenCalledWith(111)
      expect(mockUsersService.patchUserMetaData).toHaveBeenCalledWith(1, {
        customerId: 'cus_123',
        checkoutSessionId: null,
      })
    })

    it('should throw if no customerId in session', async () => {
      const event = {
        type: WebhookEventType.CheckoutSessionCompleted,
        data: {
          object: {
            customer: null,
            metadata: { userId: '1' },
          },
        },
      } as unknown as Stripe.CheckoutSessionCompletedEvent

      await expect(
        service.checkoutSessionCompletedHandler(event),
      ).rejects.toThrow('No customerId found in checkout session')
    })

    it('should throw if no userId in session metadata', async () => {
      const event = {
        type: WebhookEventType.CheckoutSessionCompleted,
        data: {
          object: {
            customer: 'cus_123',
            metadata: {},
          },
        },
      } as unknown as Stripe.CheckoutSessionCompletedEvent

      await expect(
        service.checkoutSessionCompletedHandler(event),
      ).rejects.toThrow('No userId found in checkout session metadata')
    })

    it('should not fail webhook if analytics tracking fails', async () => {
      const event = {
        type: WebhookEventType.CheckoutSessionCompleted,
        data: {
          object: {
            id: 'cs_123',
            customer: 'cus_123',
            subscription: 'sub_123',
            metadata: { userId: '1' },
          },
        },
      } as unknown as Stripe.CheckoutSessionCompletedEvent

      const futureDate = new Date()
      futureDate.setFullYear(futureDate.getFullYear() + 1)
      mockUsersService.findUser.mockResolvedValue({
        id: 1,
        email: 'test@test.com',
      })
      mockCampaignsService.findByUserId.mockResolvedValue({
        id: 111,
        slug: 'test',
        details: { electionDate: futureDate.toISOString() },
        data: {},
      })
      mockCampaignsService.patchCampaignDetails.mockResolvedValue(undefined)
      mockCampaignsService.setIsPro.mockResolvedValue(undefined)
      mockUsersService.patchUserMetaData.mockResolvedValue(undefined)
      mockSlackService.message.mockResolvedValue(undefined)
      mockEmailService.sendTemplateEmail.mockResolvedValue(undefined)
      mockVoterFileService.downloadAccessAlert.mockResolvedValue(undefined)

      // Analytics throws but webhook should still succeed
      mockAnalyticsService.trackProPayment.mockRejectedValue(
        new Error('Analytics service down'),
      )

      await expect(
        service.checkoutSessionCompletedHandler(event),
      ).resolves.not.toThrow()
    })
  })

  describe('checkoutSessionExpiredHandler', () => {
    it('should clear checkoutSessionId from user metadata', async () => {
      const event = {
        type: WebhookEventType.CheckoutSessionExpired,
        data: {
          object: {
            metadata: { userId: '42' },
          },
        },
      } as unknown as Stripe.CheckoutSessionExpiredEvent

      mockUsersService.patchUserMetaData.mockResolvedValue(undefined)

      await service.checkoutSessionExpiredHandler(event)

      expect(mockUsersService.patchUserMetaData).toHaveBeenCalledWith(42, {
        checkoutSessionId: null,
      })
    })

    it('should throw if no userId in expired session metadata', async () => {
      const event = {
        type: WebhookEventType.CheckoutSessionExpired,
        data: {
          object: {
            metadata: {},
          },
        },
      } as unknown as Stripe.CheckoutSessionExpiredEvent

      await expect(
        service.checkoutSessionExpiredHandler(event),
      ).rejects.toThrow(
        'No userId found in expired checkout session metadata',
      )
    })
  })

  describe('customerSubscriptionDeletedHandler', () => {
    it('should cancel Pro for active users', async () => {
      const event = {
        type: WebhookEventType.CustomerSubscriptionDeleted,
        data: {
          object: { id: 'sub_123' },
        },
      } as unknown as Stripe.CustomerSubscriptionDeletedEvent

      const mockCampaign = { id: 111, userId: 1, slug: 'test' }
      const mockUser = {
        id: 1,
        email: 'test@test.com',
        metaData: {},
        firstName: 'Test',
        lastName: 'User',
      }

      mockCampaignsService.findBySubscriptionId.mockResolvedValue(
        mockCampaign,
      )
      mockUsersService.findUser.mockResolvedValue(mockUser)
      mockCampaignsService.persistCampaignProCancellation.mockResolvedValue(
        undefined,
      )
      mockCampaignsService.patchCampaignDetails.mockResolvedValue(undefined)
      mockSlackService.message.mockResolvedValue(undefined)

      await service.customerSubscriptionDeletedHandler(event)

      expect(
        mockCampaignsService.persistCampaignProCancellation,
      ).toHaveBeenCalledWith(mockCampaign)
    })

    it('should skip processing if user is already deleted', async () => {
      const event = {
        type: WebhookEventType.CustomerSubscriptionDeleted,
        data: {
          object: { id: 'sub_123' },
        },
      } as unknown as Stripe.CustomerSubscriptionDeletedEvent

      mockCampaignsService.findBySubscriptionId.mockResolvedValue({
        id: 111,
        userId: 1,
      })
      mockUsersService.findUser.mockResolvedValue({
        id: 1,
        metaData: { isDeleted: true },
      })

      await service.customerSubscriptionDeletedHandler(event)

      expect(
        mockCampaignsService.persistCampaignProCancellation,
      ).not.toHaveBeenCalled()
    })
  })
})
