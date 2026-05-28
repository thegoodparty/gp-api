import { BadGatewayException } from '@nestjs/common'
import { User } from '@prisma/client'
import Stripe from 'stripe'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import {
  CustomCheckoutSessionPayload,
  PaymentIntentPayload,
  PaymentType,
} from 'src/payments/payments.types'
import { PurchaseType } from 'src/payments/purchase.types'
import { SlackService } from 'src/vendors/slack/services/slack.service'
import { StripeService } from './stripe.service'

const buildStripeMock = () => ({
  products: { retrieve: vi.fn() },
  paymentIntents: {
    create: vi.fn(),
    retrieve: vi.fn(),
    update: vi.fn(),
  },
  checkout: {
    sessions: {
      create: vi.fn(),
      retrieve: vi.fn(),
    },
  },
  billingPortal: {
    sessions: { create: vi.fn() },
  },
  subscriptions: {
    retrieve: vi.fn(),
    cancel: vi.fn(),
  },
  webhooks: {
    constructEvent: vi.fn(),
  },
})

type StripeMock = ReturnType<typeof buildStripeMock>

describe('StripeService', () => {
  let service: StripeService
  let stripe: StripeMock
  const slack = { errorMessage: vi.fn() }
  const logger = createMockLogger()

  const mockUser = {
    id: 42,
    email: 'user@example.com',
    metaData: { customerId: 'cus_existing' },
  } as unknown as User

  beforeEach(() => {
    vi.clearAllMocks()
    stripe = buildStripeMock()
    service = new StripeService(slack as unknown as SlackService, logger)
    Object.defineProperty(service, 'stripe', { value: stripe })
  })

  describe('createPaymentIntent', () => {
    const payload: PaymentIntentPayload<PaymentType.POLL> = {
      type: PaymentType.POLL,
      amount: 1234.9,
      description: 'Poll purchase',
      purchaseType: PurchaseType.POLL,
      count: 100,
      pollId: 7,
    }

    it('forwards customerId, floored amount, and metadata to Stripe', async () => {
      const intent = { id: 'pi_1' } as Stripe.PaymentIntent
      stripe.paymentIntents.create.mockResolvedValue(intent)

      const result = await service.createPaymentIntent(mockUser, payload)

      expect(result).toBe(intent)
      expect(stripe.paymentIntents.create).toHaveBeenCalledExactlyOnceWith({
        customer: 'cus_existing',
        amount: 1234,
        currency: 'usd',
        description: 'Poll purchase',
        automatic_payment_methods: { enabled: true },
        metadata: {
          purchaseType: PurchaseType.POLL,
          count: 100,
          pollId: 7,
          userId: 42,
          paymentType: PaymentType.POLL,
        },
      })
    })

    it('propagates errors from Stripe', async () => {
      stripe.paymentIntents.create.mockRejectedValue(new Error('stripe down'))

      await expect(
        service.createPaymentIntent(mockUser, payload),
      ).rejects.toThrow('stripe down')
    })
  })

  describe('retrievePaymentIntent', () => {
    it('returns the intent from Stripe', async () => {
      const intent = { id: 'pi_1' } as Stripe.PaymentIntent
      stripe.paymentIntents.retrieve.mockResolvedValue(intent)

      const result = await service.retrievePaymentIntent('pi_1')

      expect(result).toBe(intent)
      expect(stripe.paymentIntents.retrieve).toHaveBeenCalledExactlyOnceWith(
        'pi_1',
      )
    })
  })

  describe('updatePaymentIntentMetadata', () => {
    it('passes the metadata payload through to Stripe', async () => {
      const intent = { id: 'pi_1' } as Stripe.PaymentIntent
      stripe.paymentIntents.update.mockResolvedValue(intent)

      const result = await service.updatePaymentIntentMetadata('pi_1', {
        foo: 'bar',
      })

      expect(result).toBe(intent)
      expect(stripe.paymentIntents.update).toHaveBeenCalledExactlyOnceWith(
        'pi_1',
        { metadata: { foo: 'bar' } },
      )
    })
  })

  describe('retrieveCheckoutSession', () => {
    it('returns the session from Stripe', async () => {
      const session = { id: 'cs_1' } as Stripe.Checkout.Session
      stripe.checkout.sessions.retrieve.mockResolvedValue(session)

      const result = await service.retrieveCheckoutSession('cs_1')

      expect(result).toBe(session)
      expect(stripe.checkout.sessions.retrieve).toHaveBeenCalledExactlyOnceWith(
        'cs_1',
      )
    })
  })

  describe('createCheckoutSession', () => {
    it('builds a subscription session and returns redirectUrl + id', async () => {
      stripe.products.retrieve.mockResolvedValue({
        default_price: 'price_pro',
      } as unknown as Stripe.Product)
      stripe.checkout.sessions.create.mockResolvedValue({
        id: 'cs_1',
        url: 'https://stripe.test/cs_1',
      } as Stripe.Checkout.Session)

      const result = await service.createCheckoutSession(7, 'a@b.com')

      expect(result).toEqual({
        redirectUrl: 'https://stripe.test/cs_1',
        checkoutSessionId: 'cs_1',
      })
      expect(stripe.checkout.sessions.create).toHaveBeenCalledExactlyOnceWith({
        metadata: { userId: 7 },
        customer_email: 'a@b.com',
        billing_address_collection: 'auto',
        line_items: [{ price: 'price_pro', quantity: 1 }],
        mode: 'subscription',
        allow_promotion_codes: true,
        expand: [
          'subscription',
          'subscription.items.data.price',
          'payment_intent.payment_method',
        ],
        success_url:
          'http://localhost:4000/dashboard/pro-sign-up/success?' +
          'session_id={CHECKOUT_SESSION_ID}',
        cancel_url: 'http://localhost:4000/dashboard',
      })
    })

    it('omits customer_email when email is null', async () => {
      stripe.products.retrieve.mockResolvedValue({
        default_price: 'price_pro',
      } as unknown as Stripe.Product)
      stripe.checkout.sessions.create.mockResolvedValue({
        id: 'cs_2',
        url: 'https://stripe.test/cs_2',
      } as Stripe.Checkout.Session)

      await service.createCheckoutSession(7)

      const [arg] = stripe.checkout.sessions.create.mock.calls[0] as [
        Stripe.Checkout.SessionCreateParams,
      ]
      expect(arg).not.toHaveProperty('customer_email')
    })
  })

  describe('createCustomCheckoutSession', () => {
    const payload: CustomCheckoutSessionPayload = {
      type: PaymentType.POLL,
      purchaseType: PurchaseType.POLL,
      amount: 4999.7,
      productName: 'Poll Pack',
      allowPromoCodes: true,
      returnUrl: 'https://app.test/return',
      metadata: { campaignId: 9, skipMe: undefined },
    }

    it('returns id, clientSecret, and amount in dollars on success', async () => {
      stripe.checkout.sessions.create.mockResolvedValue({
        id: 'cs_2',
        client_secret: 'cs_secret',
        amount_total: 4999,
      } as Stripe.Checkout.Session)

      const result = await service.createCustomCheckoutSession(
        { id: 5, email: 'u@e.com', customerId: 'cus_5' },
        payload,
      )

      expect(result).toEqual({
        id: 'cs_2',
        clientSecret: 'cs_secret',
        amount: 49.99,
      })
      expect(stripe.checkout.sessions.create).toHaveBeenCalledExactlyOnceWith({
        ui_mode: 'custom',
        mode: 'payment',
        customer: 'cus_5',
        payment_intent_data: { receipt_email: 'u@e.com' },
        allow_promotion_codes: true,
        return_url: 'https://app.test/return',
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: { name: 'Poll Pack' },
              unit_amount: 4999,
            },
            quantity: 1,
          },
        ],
        metadata: {
          campaignId: '9',
          userId: '5',
          paymentType: PaymentType.POLL,
          purchaseType: PurchaseType.POLL,
        },
      })
    })

    it('falls back to payload.amount / 100 when amount_total is null', async () => {
      stripe.checkout.sessions.create.mockResolvedValue({
        id: 'cs_3',
        client_secret: 'cs_secret_2',
        amount_total: null,
      } as unknown as Stripe.Checkout.Session)

      const result = await service.createCustomCheckoutSession(
        { id: 5, email: 'u@e.com', customerId: 'cus_5' },
        payload,
      )

      expect(result).toEqual({
        id: 'cs_3',
        clientSecret: 'cs_secret_2',
        amount: payload.amount / 100,
      })
    })

    it('throws BadGatewayException when Stripe returns no client_secret', async () => {
      stripe.checkout.sessions.create.mockResolvedValue({
        id: 'cs_2',
        client_secret: null,
      } as Stripe.Checkout.Session)

      await expect(
        service.createCustomCheckoutSession(
          { id: 5, email: 'u@e.com', customerId: 'cus_5' },
          payload,
        ),
      ).rejects.toThrow(BadGatewayException)
    })

    it('uses customer_email when customerId is absent', async () => {
      stripe.checkout.sessions.create.mockResolvedValue({
        id: 'cs_email',
        client_secret: 'cs_secret_email',
        amount_total: 4999,
      } as Stripe.Checkout.Session)

      await service.createCustomCheckoutSession(
        { id: 5, email: 'u@e.com', customerId: undefined },
        payload,
      )

      const [arg] = stripe.checkout.sessions.create.mock.calls[0] as [
        Stripe.Checkout.SessionCreateParams,
      ]
      expect(arg.customer_email).toBe('u@e.com')
      expect(arg).not.toHaveProperty('customer')
    })

    it('omits both customer fields when customerId and email absent', async () => {
      stripe.checkout.sessions.create.mockResolvedValue({
        id: 'cs_anon',
        client_secret: 'cs_secret_anon',
        amount_total: 4999,
      } as Stripe.Checkout.Session)

      await service.createCustomCheckoutSession(
        { id: 5, email: null, customerId: undefined },
        payload,
      )

      const [arg] = stripe.checkout.sessions.create.mock.calls[0] as [
        Stripe.Checkout.SessionCreateParams,
      ]
      expect(arg).not.toHaveProperty('customer')
      expect(arg).not.toHaveProperty('customer_email')
      expect(arg).not.toHaveProperty('payment_intent_data')
    })
  })

  describe('createPortalSession', () => {
    it('creates a billing portal session for the given customer', async () => {
      const portal = { id: 'bps_1' } as Stripe.BillingPortal.Session
      stripe.billingPortal.sessions.create.mockResolvedValue(portal)

      const result = await service.createPortalSession('cus_9')

      expect(result).toBe(portal)
      expect(
        stripe.billingPortal.sessions.create,
      ).toHaveBeenCalledExactlyOnceWith({
        customer: 'cus_9',
        return_url: expect.stringContaining('/profile'),
      })
    })
  })

  describe('parseWebhookEvent', () => {
    it('delegates to stripe.webhooks.constructEvent', async () => {
      const event = { id: 'evt_1' } as Stripe.Event
      stripe.webhooks.constructEvent.mockReturnValue(event)
      const body = Buffer.from('{}')

      const result = await service.parseWebhookEvent(body, 'sig_1')

      expect(result).toBe(event)
      expect(stripe.webhooks.constructEvent).toHaveBeenCalledExactlyOnceWith(
        body,
        'sig_1',
        process.env.STRIPE_WEBSOCKET_SECRET,
      )
    })
  })

  describe('fetchCustomerIdFromCheckoutSession', () => {
    it('returns the customer id when paid and customer is a string', async () => {
      stripe.checkout.sessions.retrieve.mockResolvedValue({
        payment_status: 'paid',
        customer: 'cus_paid',
      } as Stripe.Checkout.Session)

      const result = await service.fetchCustomerIdFromCheckoutSession('cs_paid')

      expect(result).toBe('cus_paid')
    })

    it('returns customer.id when paid and customer is an expanded object', async () => {
      stripe.checkout.sessions.retrieve.mockResolvedValue({
        payment_status: 'paid',
        customer: { id: 'cus_expanded', object: 'customer' },
      } as Stripe.Checkout.Session)

      const result =
        await service.fetchCustomerIdFromCheckoutSession('cs_expanded')

      expect(result).toBe('cus_expanded')
    })

    it('returns null when paid but customer is absent', async () => {
      stripe.checkout.sessions.retrieve.mockResolvedValue({
        payment_status: 'paid',
        customer: null,
      } as Stripe.Checkout.Session)

      const result =
        await service.fetchCustomerIdFromCheckoutSession('cs_nocustomer')

      expect(result).toBeNull()
    })

    it('returns null when the session is not paid', async () => {
      stripe.checkout.sessions.retrieve.mockResolvedValue({
        payment_status: 'unpaid',
        customer: 'cus_unpaid',
      } as Stripe.Checkout.Session)

      const result =
        await service.fetchCustomerIdFromCheckoutSession('cs_unpaid')

      expect(result).toBeNull()
    })

    it('throws BadGatewayException when Stripe retrieve fails', async () => {
      stripe.checkout.sessions.retrieve.mockRejectedValue(new Error('boom'))

      await expect(
        service.fetchCustomerIdFromCheckoutSession('cs_err'),
      ).rejects.toThrow(BadGatewayException)
      expect(logger.error).toHaveBeenCalled()
    })
  })

  describe('retrieveSubscription', () => {
    it('returns the subscription on success', async () => {
      const sub = { id: 'sub_1' } as Stripe.Subscription
      stripe.subscriptions.retrieve.mockResolvedValue(sub)

      const result = await service.retrieveSubscription('sub_1')

      expect(result).toBe(sub)
    })

    it('translates Stripe errors into BadGatewayException', async () => {
      stripe.subscriptions.retrieve.mockRejectedValue(new Error('nope'))

      await expect(service.retrieveSubscription('sub_1')).rejects.toThrow(
        BadGatewayException,
      )
      expect(logger.error).toHaveBeenCalled()
    })
  })

  describe('cancelSubscription', () => {
    it('returns the canceled subscription on success', async () => {
      const sub = { id: 'sub_1', status: 'canceled' } as Stripe.Subscription
      stripe.subscriptions.cancel.mockResolvedValue(sub)

      const result = await service.cancelSubscription('sub_1')

      expect(result).toBe(sub)
      expect(slack.errorMessage).not.toHaveBeenCalled()
    })

    it('notifies Slack and throws BadGatewayException on Stripe error', async () => {
      const err = new Error('cancel failed')
      stripe.subscriptions.cancel.mockRejectedValue(err)

      await expect(service.cancelSubscription('sub_1')).rejects.toThrow(
        BadGatewayException,
      )
      expect(slack.errorMessage).toHaveBeenCalledExactlyOnceWith({
        message: 'Error canceling subscription',
        error: { subscriptionId: 'sub_1', error: err },
      })
    })
  })
})
