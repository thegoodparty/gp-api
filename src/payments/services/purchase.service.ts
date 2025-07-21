import { Injectable } from '@nestjs/common'
import { User } from '@prisma/client'
import {
  PurchaseType,
  PurchaseHandler,
  CreatePurchaseIntentDto,
  CompletePurchaseDto,
} from '../purchase.types'
import { DomainPurchaseHandler } from '../handlers/domain-purchase.handler'
import { PaymentsService } from './payments.service'
import { PaymentType } from '../payments.types'

@Injectable()
export class PurchaseService {
  private handlers: Map<PurchaseType, PurchaseHandler> = new Map()

  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly domainPurchaseHandler: DomainPurchaseHandler,
  ) {
    this.handlers.set(PurchaseType.DOMAIN_REGISTRATION, domainPurchaseHandler)
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

    const paymentMetadata = this.buildPaymentMetadata(
      dto.type,
      dto.metadata,
      amount,
    )

    const paymentIntent = await this.paymentsService.createPayment(
      user,
      paymentMetadata,
    )

    return {
      clientSecret: paymentIntent.client_secret!,
      amount: amount / 100,
    }
  }

  async completePurchase(dto: CompletePurchaseDto): Promise<any> {
    const paymentIntent = await this.paymentsService.retrievePayment(
      dto.paymentIntentId,
    )

    if (paymentIntent.status !== 'succeeded') {
      throw new Error(`Payment not completed: ${paymentIntent.status}`)
    }

    const purchaseType = this.mapPaymentTypeToPurchaseType(
      paymentIntent.metadata?.paymentType as string,
    )
    const handler = this.handlers.get(purchaseType)

    if (!handler) {
      throw new Error('No handler found for this purchase type')
    }

    const result = await handler.executePostPurchase(
      dto.paymentIntentId,
      paymentIntent.metadata as any,
    )
    return result
  }

  private buildPaymentMetadata(
    type: PurchaseType,
    metadata: any,
    amount: number,
  ) {
    switch (type) {
      case PurchaseType.DOMAIN_REGISTRATION:
        return {
          type: PaymentType.DOMAIN_REGISTRATION,
          amount,
          domainName: metadata.domainName,
          websiteId: metadata.websiteId,
        }
      default:
        throw new Error(`Unsupported purchase type: ${type}`)
    }
  }

  private mapPaymentTypeToPurchaseType(paymentType: string): PurchaseType {
    switch (paymentType) {
      case PaymentType.DOMAIN_REGISTRATION:
        return PurchaseType.DOMAIN_REGISTRATION
      default:
        throw new Error(`Unknown payment type: ${paymentType}`)
    }
  }
}
