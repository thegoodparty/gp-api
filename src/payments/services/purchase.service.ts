import { Injectable, Logger } from '@nestjs/common'
import { Campaign, User } from '@prisma/client'
import {
  CompletePurchaseDto,
  CreatePurchaseIntentDto,
  PostPurchaseHandler,
  PurchaseHandler,
  PurchaseType,
} from '../purchase.types'
import { PaymentsService } from './payments.service'
import { PaymentIntentPayload, PaymentType } from '../payments.types'
import Stripe from 'stripe'

@Injectable()
export class PurchaseService {
  private readonly logger = new Logger('PurchaseService')
  // TODO: Refactor to remove the "handlers" anti-pattern here along w/
  //  implementors of the anti-pattern elsewhere.
  //  It's absolutely over-engineered, causes confusion and obfuscation in the
  //  code, and makes it very difficult to create type-safe annotations w/o
  //  having to resort to `any` or `unknown` escape hatches.
  //  It also tightly couples the purchasing logic flows, with the logic flows of
  //  _what_ is being purchased and _how_ it is being purchased:
  //  https://app.clickup.com/t/90132012119/ENG-4065
  private handlers: Map<PurchaseType, PurchaseHandler<unknown>> = new Map()
  private postPurchaseHandlers: Map<
    PurchaseType,
    PostPurchaseHandler<unknown>
  > = new Map()

  constructor(private readonly paymentsService: PaymentsService) {}

  registerPurchaseHandler(
    type: PurchaseType,
    handler: PurchaseHandler<unknown>,
  ): void {
    this.handlers.set(type, handler)
  }

  registerPostPurchaseHandler(
    type: PurchaseType,
    handler: PostPurchaseHandler<unknown>,
  ): void {
    this.postPurchaseHandlers.set(type, handler)
  }

  async createPurchaseIntent({
    user,
    dto,
    campaign,
  }: {
    user: User
    dto: CreatePurchaseIntentDto<unknown>
    campaign?: Campaign
  }): Promise<{
    id: string
    clientSecret: string
    amount: number
    status: Stripe.PaymentIntent.Status
  }> {
    this.logger.log(
      JSON.stringify({
        user: user.id,
        dto,
        campaign,
        msg: 'Attempting payment intent creation for user',
      }),
    )
    const handler = this.handlers.get(dto.type)
    if (!handler) {
      throw new Error(`No handler found for purchase type: ${dto.type}`)
    }

    const existingPaymentIntent: void | Stripe.PaymentIntent =
      await handler.validatePurchase({
        // TODO: Remove this cast once `unknown` is removed from `PurchaseMetadata`
        //  https://app.clickup.com/t/90132012119/ENG-6107
        ...(dto.metadata as Record<string, unknown>),
        ...(campaign?.id ? { campaignId: campaign?.id } : {}),
      })
    const amount = await handler.calculateAmount(dto.metadata)

    const paymentMetadata = {
      type: this.getPaymentType(dto.type),
      amount,
      ...(dto.metadata as Record<string, unknown>),
      purchaseType: dto.type,
    } as PaymentIntentPayload<PaymentType>

    const paymentIntent =
      existingPaymentIntent ||
      (await this.paymentsService.createPayment(user, paymentMetadata))

    return {
      id: paymentIntent.id,
      clientSecret: paymentIntent.client_secret!,
      amount: paymentIntent.amount / 100,
      status: paymentIntent.status,
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async completePurchase(dto: CompletePurchaseDto): Promise<any> {
    const paymentIntent = await this.paymentsService.retrievePayment(
      dto.paymentIntentId,
    )

    if (paymentIntent.status !== 'succeeded') {
      throw new Error(`Payment not completed: ${paymentIntent.status}`)
    }

    const purchaseType = paymentIntent.metadata?.purchaseType as PurchaseType
    if (!purchaseType) {
      throw new Error('No purchase type found in payment metadata')
    }

    const postPurchaseHandler = this.postPurchaseHandlers.get(purchaseType)
    if (!postPurchaseHandler) {
      throw new Error('No post-purchase handler found for this purchase type')
    }

    return await postPurchaseHandler(
      dto.paymentIntentId,
      paymentIntent.metadata,
    )
  }

  private getPaymentType(purchaseType: PurchaseType): PaymentType {
    switch (purchaseType) {
      case PurchaseType.DOMAIN_REGISTRATION:
        return PaymentType.DOMAIN_REGISTRATION
      case PurchaseType.TEXT:
        return PaymentType.OUTREACH_PURCHASE
      case PurchaseType.POLL:
        return PaymentType.POLL
      default:
        throw new Error(`No payment type mapping for: ${purchaseType}`)
    }
  }
}
