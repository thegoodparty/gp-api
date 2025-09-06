import { Injectable, Logger } from '@nestjs/common'
import { User } from '@prisma/client'
import {
  CompletePurchaseDto,
  CreatePurchaseIntentDto,
  PostPurchaseHandler,
  PurchaseHandler,
  PurchaseType,
} from '../purchase.types'
import { PaymentsService } from './payments.service'
import { PaymentType } from '../payments.types'

@Injectable()
export class PurchaseService {
  private readonly logger = new Logger('PurchaseService')
  private handlers: Map<PurchaseType, PurchaseHandler> = new Map()
  private postPurchaseHandlers: Map<PurchaseType, PostPurchaseHandler> =
    new Map()

  constructor(private readonly paymentsService: PaymentsService) {}

  registerPurchaseHandler(type: PurchaseType, handler: PurchaseHandler): void {
    this.handlers.set(type, handler)
  }

  registerPostPurchaseHandler(
    type: PurchaseType,
    handler: PostPurchaseHandler,
  ): void {
    this.postPurchaseHandlers.set(type, handler)
  }

  async createPurchaseIntent(
    user: User,
    dto: CreatePurchaseIntentDto,
  ): Promise<{ clientSecret: string; amount: number }> {
    const handler = this.handlers.get(dto.type)
    if (!handler) {
      throw new Error(`No handler found for purchase type: ${dto.type}`)
    }

    await handler.validatePurchase(dto.metadata)
    const amount = await handler.calculateAmount(dto.metadata)

    const paymentMetadata = {
      type: this.getPaymentType(dto.type),
      amount,
      ...dto.metadata,
      purchaseType: dto.type,
    } as any

    const paymentIntent = await this.paymentsService.createPayment(
      user,
      paymentMetadata,
    )

    return {
      clientSecret: paymentIntent.client_secret!,
      amount: paymentIntent.amount / 100,
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

    const result = await postPurchaseHandler(
      dto.paymentIntentId,
      paymentIntent.metadata as any,
    )
    return result
  }

  private getPaymentType(purchaseType: PurchaseType): PaymentType {
    switch (purchaseType) {
      case PurchaseType.DOMAIN_REGISTRATION:
        return PaymentType.DOMAIN_REGISTRATION
      case PurchaseType.TEXT:
        return PaymentType.OUTREACH_PURCHASE
      default:
        throw new Error(`No payment type mapping for: ${purchaseType}`)
    }
  }
}
