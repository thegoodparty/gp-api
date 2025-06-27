import { Injectable } from '@nestjs/common'
import { User } from '@prisma/client'
import { StripeService } from 'src/stripe/services/stripe.service'
import { PaymentIntentPayload, PaymentType } from '../payments.types'

@Injectable()
export class PaymentsService {
  constructor(private readonly stripe: StripeService) {}

  async createPayment<T extends PaymentType>(
    user: User,
    payload: PaymentIntentPayload<T>,
  ) {
    return this.stripe.createPaymentIntent(user, payload)
  }

  async retrievePayment(paymentId: string) {
    return this.stripe.retrievePaymentIntent(paymentId)
  }
}
