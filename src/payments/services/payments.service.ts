import {
  Injectable,
  BadGatewayException,
  BadRequestException,
} from '@nestjs/common'
import { User } from '@prisma/client'
import { StripeService } from 'src/stripe/services/stripe.service'
import { PaymentIntentPayload, PaymentType } from '../payments.types'
import { UsersService } from '../../users/services/users.service'

@Injectable()
export class PaymentsService {
  constructor(
    private readonly stripe: StripeService,
    private readonly usersService: UsersService,
  ) {}

  async createPayment<T extends PaymentType>(
    user: User,
    payload: PaymentIntentPayload<T>,
  ) {
    return this.stripe.createPaymentIntent(user, payload)
  }

  async retrievePayment(paymentId: string) {
    return this.stripe.retrievePaymentIntent(paymentId)
  }

  async getValidatedPaymentUser(
    paymentIntentId: string,
  ): Promise<{ paymentIntent: any; user: User }> {
    const paymentIntent = await this.retrievePayment(paymentIntentId)

    if (paymentIntent.status !== 'succeeded') {
      throw new BadRequestException(
        `Payment not completed. Status: ${paymentIntent.status}`,
      )
    }

    const userId = paymentIntent.metadata?.userId
    if (!userId) {
      throw new BadGatewayException('No userId found in payment metadata')
    }

    const user = await this.usersService.findUser({
      id: parseInt(userId),
    })

    if (!user) {
      throw new BadGatewayException('User not found for payment')
    }

    return { paymentIntent, user }
  }
}
