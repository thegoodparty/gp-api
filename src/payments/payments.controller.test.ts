import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common'
import { UserRole } from '../generated/prisma'
import Stripe from 'stripe'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IS_PUBLIC_KEY } from '../authentication/decorators/PublicAccess.decorator'
import { ROLES_KEY } from '../authentication/decorators/Roles.decorator'
import { CampaignsService } from '../campaigns/services/campaigns.service'
import { StripeService } from '../vendors/stripe/services/stripe.service'
import { PaymentsController } from './payments.controller'
import { PaymentEventsService } from './services/paymentEventsService'
import { PaymentsService } from './services/payments.service'

type WebhookReq = Parameters<PaymentsController['handleStripeEvent']>[0]

const buildRequest = (rawBody: Buffer | null): WebhookReq =>
  ({ rawBody }) as unknown as WebhookReq

describe('PaymentsController', () => {
  let controller: PaymentsController
  let stripeService: { parseWebhookEvent: ReturnType<typeof vi.fn> }
  let stripeEvents: { handleEvent: ReturnType<typeof vi.fn> }
  let paymentsService: { fixMissingCustomerIds: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    stripeService = { parseWebhookEvent: vi.fn() }
    stripeEvents = { handleEvent: vi.fn() }
    paymentsService = { fixMissingCustomerIds: vi.fn() }

    controller = new PaymentsController(
      stripeService as unknown as StripeService,
      stripeEvents as unknown as PaymentEventsService,
      {} as CampaignsService,
      paymentsService as unknown as PaymentsService,
      createMockLogger(),
    )
  })

  describe('decorators', () => {
    it('marks handleStripeEvent as @PublicAccess', () => {
      const isPublic = Reflect.getMetadata(
        IS_PUBLIC_KEY,
        PaymentsController.prototype.handleStripeEvent,
      )
      expect(isPublic).toBe(true)
    })

    it('restricts fixMissingCustomerIds to admin via @Roles', () => {
      const roles = Reflect.getMetadata(
        ROLES_KEY,
        PaymentsController.prototype.fixMissingCustomerIds,
      )
      expect(roles).toEqual([UserRole.admin])
    })
  })

  describe('handleStripeEvent', () => {
    const headers = { 'stripe-signature': 'sig_test' }
    const rawBody = Buffer.from('{"id":"evt_test"}')
    const stripeEvent = {
      id: 'evt_test',
      type: 'checkout.session.completed',
    } as unknown as Stripe.Event

    it('parses the event and dispatches to PaymentEventsService', async () => {
      stripeService.parseWebhookEvent.mockResolvedValue(stripeEvent)
      stripeEvents.handleEvent.mockResolvedValue(undefined)

      await controller.handleStripeEvent(buildRequest(rawBody), headers)

      expect(stripeService.parseWebhookEvent).toHaveBeenCalledWith(
        rawBody,
        headers['stripe-signature'],
      )
      expect(stripeEvents.handleEvent).toHaveBeenCalledWith(stripeEvent)
    })

    it('throws BadRequestException when the signature header is missing', async () => {
      await expect(
        controller.handleStripeEvent(buildRequest(rawBody), {}),
      ).rejects.toThrow(BadRequestException)
      expect(stripeService.parseWebhookEvent).not.toHaveBeenCalled()
    })

    it('throws BadRequestException when signature verification fails', async () => {
      stripeService.parseWebhookEvent.mockRejectedValue(
        new Error('Invalid signature'),
      )

      await expect(
        controller.handleStripeEvent(buildRequest(rawBody), headers),
      ).rejects.toThrow(BadRequestException)
      expect(stripeEvents.handleEvent).not.toHaveBeenCalled()
    })

    it('rethrows HttpException from PaymentEventsService unchanged', async () => {
      const original = new HttpException('boom', HttpStatus.BAD_GATEWAY)
      stripeService.parseWebhookEvent.mockResolvedValue(stripeEvent)
      stripeEvents.handleEvent.mockRejectedValue(original)

      await expect(
        controller.handleStripeEvent(buildRequest(rawBody), headers),
      ).rejects.toBe(original)
    })

    it('wraps unknown handler errors in BadRequestException', async () => {
      stripeService.parseWebhookEvent.mockResolvedValue(stripeEvent)
      stripeEvents.handleEvent.mockRejectedValue(new Error('db down'))

      await expect(
        controller.handleStripeEvent(buildRequest(rawBody), headers),
      ).rejects.toThrow(BadRequestException)
    })
  })

  describe('fixMissingCustomerIds', () => {
    it('delegates to PaymentsService.fixMissingCustomerIds', async () => {
      const result = {
        message: 'Processed 0 users',
        success: 0,
        failed: 0,
        skipped: 0,
        details: { success: [], failed: [], skipped: [] },
      }
      paymentsService.fixMissingCustomerIds.mockResolvedValue(result)

      await expect(controller.fixMissingCustomerIds()).resolves.toBe(result)
      expect(paymentsService.fixMissingCustomerIds).toHaveBeenCalledOnce()
    })
  })
})
