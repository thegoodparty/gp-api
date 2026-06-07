import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import { BadGatewayException } from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SlackService } from 'src/vendors/slack/services/slack.service'
import { StripeService } from './stripe.service'

const { sessionsCreate, productsRetrieve } = vi.hoisted(() => ({
  sessionsCreate: vi.fn(),
  productsRetrieve: vi.fn(),
}))

vi.mock('stripe', () => ({
  default: class {
    checkout = { sessions: { create: sessionsCreate } }
    products = { retrieve: productsRetrieve }
  },
}))

const userId = 7
const email = 'buyer@example.com'
const priceId = 'price_test_pro'

describe('StripeService Pro subscription checkout', () => {
  let service: StripeService

  beforeEach(() => {
    productsRetrieve.mockResolvedValue({ default_price: priceId })
    service = new StripeService(
      {} as unknown as SlackService,
      createMockLogger(),
    )
  })

  describe('createEmbeddedProSubscriptionCheckoutSession', () => {
    it('builds an embedded subscription session and returns the client_secret', async () => {
      sessionsCreate.mockResolvedValue({
        id: 'cs_test_embedded',
        client_secret: 'cs_test_embedded_secret_abc',
      })

      const result = await service.createEmbeddedProSubscriptionCheckoutSession(
        userId,
        email,
        'https://app.test/dashboard/pro-upgrade?session_id={CHECKOUT_SESSION_ID}',
      )

      const args = sessionsCreate.mock.calls[0][0]
      expect(args.ui_mode).toBe('custom')
      expect(args.mode).toBe('subscription')
      expect(args.return_url).toBe(
        'https://app.test/dashboard/pro-upgrade?session_id={CHECKOUT_SESSION_ID}',
      )
      expect(args.success_url).toBeUndefined()
      expect(args.metadata).toEqual({ userId })
      expect(args.line_items).toEqual([{ price: priceId, quantity: 1 }])

      expect(result).toEqual({
        clientSecret: 'cs_test_embedded_secret_abc',
        checkoutSessionId: 'cs_test_embedded',
      })
    })

    it('throws BadGatewayException when Stripe returns no client_secret', async () => {
      sessionsCreate.mockResolvedValue({
        id: 'cs_test_embedded',
        client_secret: null,
      })

      await expect(
        service.createEmbeddedProSubscriptionCheckoutSession(userId, email),
      ).rejects.toThrow(BadGatewayException)
    })

    it('carries the same userId metadata as the redirect subscription session', async () => {
      sessionsCreate.mockResolvedValue({
        id: 'cs_test',
        client_secret: 'cs_test_secret',
        url: 'https://stripe.test/checkout',
      })

      await service.createCheckoutSession(userId, email)
      const redirectArgs = sessionsCreate.mock.calls[0][0]

      await service.createEmbeddedProSubscriptionCheckoutSession(userId, email)
      const embeddedArgs = sessionsCreate.mock.calls[1][0]

      expect(embeddedArgs.metadata).toEqual(redirectArgs.metadata)
      expect(embeddedArgs.mode).toBe(redirectArgs.mode)
      expect(embeddedArgs.line_items).toEqual(redirectArgs.line_items)
    })
  })
})
