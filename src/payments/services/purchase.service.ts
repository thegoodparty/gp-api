import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common'
import { Campaign, User } from '@prisma/client'
import {
  CheckoutSessionPostPurchaseHandler,
  CompletePurchaseDto,
  CompleteCheckoutSessionDto,
  CompleteFreePurchaseDto,
  CreateCheckoutSessionDto,
  CreatePurchaseIntentDto,
  PostPurchaseHandler,
  PurchaseHandler,
  PurchaseType,
} from '../purchase.types'
import { PaymentsService } from './payments.service'
import {
  CustomCheckoutSessionPayload,
  PaymentIntentPayload,
  PaymentType,
} from '../payments.types'
import Stripe from 'stripe'
import { StripeService } from 'src/vendors/stripe/services/stripe.service'

const { WEBAPP_ROOT_URL } = process.env

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
  private checkoutSessionPostPurchaseHandlers: Map<
    PurchaseType,
    CheckoutSessionPostPurchaseHandler<unknown>
  > = new Map()

  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly stripeService: StripeService,
  ) {}

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

  registerCheckoutSessionPostPurchaseHandler(
    type: PurchaseType,
    handler: CheckoutSessionPostPurchaseHandler<unknown>,
  ): void {
    this.checkoutSessionPostPurchaseHandlers.set(type, handler)
  }

  /**
   * Creates a Custom Checkout Session for one-time payments with promo code support.
   * This is the new preferred method for purchases that should support promo codes.
   *
   * Migration reference: https://docs.stripe.com/payments/payment-element/migration-ewcs
   */
  async createCheckoutSession({
    user,
    dto,
    campaign,
  }: {
    user: User
    dto: CreateCheckoutSessionDto<unknown>
    campaign?: Campaign
  }): Promise<{
    id: string
    clientSecret: string
    amount: number
  }> {
    this.logger.log(
      JSON.stringify({
        user: user.id,
        dto,
        campaign,
        msg: 'Attempting checkout session creation for user',
      }),
    )

    if (!Object.values(PurchaseType).includes(dto.type)) {
      throw new Error(`Invalid purchase type: ${dto.type}`)
    }

    const handler = this.handlers.get(dto.type)
    if (!handler) {
      throw new Error(`No handler found for purchase type: ${dto.type}`)
    }

    // Validate the purchase (checks for existing payments, etc.)
    // For domains, validatePurchase returns an existing succeeded PaymentIntent
    // if the domain was already purchased. In the legacy createPurchaseIntent flow
    // this PI is reused. For checkout sessions we must reject the duplicate to
    // prevent charging the user twice for the same purchase.
    const existingPayment = await handler.validatePurchase({
      ...(dto.metadata as Record<string, unknown>),
      ...(campaign?.id ? { campaignId: campaign?.id } : {}),
    })

    if (existingPayment) {
      throw new Error(
        'This purchase has already been completed. Please refresh the page.',
      )
    }

    // Merge server-side campaignId into metadata for calculateAmount.
    // Handlers like outreach need campaignId to check free texts eligibility.
    // We must use the server-validated campaign, not trust the client's campaignId.
    const mergedMetadata = {
      ...(dto.metadata as Record<string, unknown>),
      ...(campaign?.id ? { campaignId: campaign.id } : {}),
    }

    const amount = await handler.calculateAmount(mergedMetadata)

    // Handle zero-amount purchases (e.g., free texts offer covers entire purchase)
    // Stripe doesn't need a real Checkout Session for $0
    // Do NOT execute post-purchase handlers here — the user hasn't confirmed yet.
    // Post-purchase (e.g., redeeming free texts) is deferred to completeFreePurchase(),
    // which the frontend calls when the user explicitly clicks "Schedule text".
    if (amount === 0) {
      const freeSessionId = `free_${Date.now()}_${user.id}`

      this.logger.log(
        `Zero-amount checkout for user ${user.id}, type ${dto.type} - skipping Stripe, deferring post-purchase until user confirmation`,
      )

      return {
        id: freeSessionId,
        clientSecret: '',
        amount: 0,
      }
    }

    const productName = handler.getProductName
      ? handler.getProductName(dto.metadata)
      : this.getDefaultProductName(dto.type)
    const productDescription = handler.getProductDescription
      ? handler.getProductDescription(dto.metadata)
      : undefined

    const returnUrl =
      dto.returnUrl ||
      `${WEBAPP_ROOT_URL}/dashboard/purchase/complete?session_id={CHECKOUT_SESSION_ID}`

    const checkoutPayload: CustomCheckoutSessionPayload = {
      type: this.getPaymentType(dto.type),
      purchaseType: dto.type,
      amount,
      productName,
      productDescription,
      allowPromoCodes: true,
      returnUrl,
      metadata: {
        ...(dto.metadata as Record<string, unknown>),
        ...(campaign?.id ? { campaignId: campaign.id } : {}),
      },
    }

    return this.stripeService.createCustomCheckoutSession(user, checkoutPayload)
  }

  /**
   * Completes a purchase made via Checkout Session.
   * Called after the user completes payment and is redirected back.
   *
   * This method is idempotent - if called multiple times (e.g., from both
   * webhook and client), the post-purchase handler will only run once.
   * Uses PaymentIntent metadata to track completion status.
   *
   * NOTE: There is a small race window between the idempotency check and
   * the metadata write. If concurrent calls (webhook + client) both pass
   * the check before either writes the flag, both may execute the handler.
   * To fully prevent this, handlers should implement their own idempotency
   * (e.g., checking for existing records before creating). A database-based
   * lock using a unique purchase record would eliminate this window entirely.
   */
  async completeCheckoutSession(
    dto: CompleteCheckoutSessionDto,
  ): Promise<{ alreadyProcessed: boolean; result?: unknown }> {
    const session = await this.stripeService.retrieveCheckoutSession(
      dto.checkoutSessionId,
    )

    if (session.status !== 'complete') {
      throw new Error(`Checkout session not completed: ${session.status}`)
    }

    const purchaseType = session.metadata?.purchaseType as PurchaseType
    if (!purchaseType) {
      throw new Error('No purchase type found in session metadata')
    }

    // Check idempotency: verify if post-purchase was already processed
    const paymentIntentId = session.payment_intent as string
    if (paymentIntentId) {
      const paymentIntent =
        await this.stripeService.retrievePaymentIntent(paymentIntentId)
      if (paymentIntent.metadata?.postPurchaseCompletedAt) {
        this.logger.log(
          JSON.stringify({
            sessionId: dto.checkoutSessionId,
            paymentIntentId,
            completedAt: paymentIntent.metadata.postPurchaseCompletedAt,
            msg: 'Post-purchase already processed, skipping (idempotent)',
          }),
        )
        return { alreadyProcessed: true }
      }
    }

    const postPurchaseHandler =
      this.checkoutSessionPostPurchaseHandlers.get(purchaseType)
    if (!postPurchaseHandler) {
      throw new Error(
        'No checkout session post-purchase handler found for this purchase type',
      )
    }

    const result = await postPurchaseHandler(
      dto.checkoutSessionId,
      session.metadata,
    )

    // Mark as processed AFTER handler succeeds to allow retries on failure
    if (paymentIntentId) {
      await this.stripeService.updatePaymentIntentMetadata(paymentIntentId, {
        postPurchaseCompletedAt: new Date().toISOString(),
      })
    }

    return { alreadyProcessed: false, result }
  }

  private getDefaultProductName(purchaseType: PurchaseType): string {
    switch (purchaseType) {
      case PurchaseType.DOMAIN_REGISTRATION:
        return 'Domain Registration'
      case PurchaseType.TEXT:
        return 'SMS Outreach'
      case PurchaseType.POLL:
        return 'Poll Credits'
      default:
        return 'Purchase'
    }
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
    if (!Object.values(PurchaseType).includes(dto.type)) {
      throw new Error(`Invalid purchase type: ${dto.type}`)
    }

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

    // Merge server-side campaignId into metadata for calculateAmount.
    // Handlers like outreach need campaignId to check free texts eligibility.
    const mergedMetadata = {
      ...(dto.metadata as Record<string, unknown>),
      ...(campaign?.id ? { campaignId: campaign.id } : {}),
    }
    const amount = await handler.calculateAmount(mergedMetadata)

    // Handle zero-amount purchases (e.g., free texts offer covers entire purchase)
    // Stripe rejects PaymentIntents with $0 so we return our own response.
    // Do NOT execute post-purchase handlers here — the user hasn't confirmed yet.
    // Post-purchase (e.g., redeeming free texts) is deferred to completeFreePurchase(),
    // which the frontend calls when the user explicitly confirms.
    if (amount === 0) {
      const freePaymentId = `free_${Date.now()}_${user.id}`

      this.logger.log(
        `Zero-amount purchase for user ${user.id}, type ${dto.type} - skipping Stripe, deferring post-purchase until user confirmation`,
      )

      return {
        id: freePaymentId,
        clientSecret: '',
        amount: 0,
        status: 'succeeded' as Stripe.PaymentIntent.Status,
      }
    }

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

  /**
   * Completes a zero-amount (free) purchase by executing the post-purchase handler.
   * This is called when the user explicitly confirms a free purchase (e.g., clicks
   * "Schedule text" after the free texts offer covers the entire cost).
   *
   * The post-purchase handler is idempotent — redeemFreeTexts uses an atomic
   * updateMany with hasFreeTextsOffer: true as a guard, so duplicate calls are safe.
   */
  async completeFreePurchase({
    dto,
    campaign,
    user,
  }: {
    dto: CompleteFreePurchaseDto
    campaign?: Campaign
    user: User
    // TODO: Replace `unknown` with discriminated union return type
    //  https://app.clickup.com/t/90132012119/ENG-6654
  }): Promise<{ result?: unknown }> {
    const { purchaseType } = dto

    if (!Object.values(PurchaseType).includes(purchaseType)) {
      throw new BadRequestException(`Invalid purchase type: ${purchaseType}`)
    }

    const purchaseHandler = this.handlers.get(purchaseType)
    if (!purchaseHandler) {
      throw new InternalServerErrorException(
        `No handler found for purchase type: ${purchaseType}`,
      )
    }

    const postPurchaseHandler =
      this.checkoutSessionPostPurchaseHandlers.get(purchaseType)
    if (!postPurchaseHandler) {
      throw new InternalServerErrorException(
        `No checkout session post-purchase handler found for purchase type: ${purchaseType}`,
      )
    }

    const mergedMetadata = {
      ...dto.metadata,
      ...(campaign?.id ? { campaignId: campaign.id } : {}),
      userId: String(user.id),
    }

    const existingPayment =
      await purchaseHandler.validatePurchase(mergedMetadata)
    if (existingPayment) {
      throw new ConflictException(
        'This purchase has already been completed. Please refresh the page.',
      )
    }

    const amount = await purchaseHandler.calculateAmount(mergedMetadata)
    if (amount !== 0) {
      throw new BadRequestException(
        `Free purchase completion is only allowed for zero-amount purchases. Calculated amount: ${amount}`,
      )
    }

    const freeSessionId = `free_confirmed_${Date.now()}`
    const result = await postPurchaseHandler(freeSessionId, {
      ...mergedMetadata,
      purchaseType,
    })

    this.logger.log(
      `Free purchase completed for type ${purchaseType}, campaign ${campaign?.id}`,
    )

    return { result }
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
