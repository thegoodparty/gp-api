import {
  BadGatewayException,
  BadRequestException,
  Injectable,
} from '@nestjs/common'
import { User } from '@prisma/client'
import { StripeService } from 'src/vendors/stripe/services/stripe.service'
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  async tempUpdateMissingCustomerId(email: string) {
    const user = await this.usersService.findUserByEmail(email)
    if (!user) {
      return null
    }

    if (user.metaData?.customerId) {
      return null
    }

    const checkoutSessionId = user.metaData?.checkoutSessionId as string
    if (!checkoutSessionId) {
      return null
    }
    const customerId =
      await this.stripe.tempCustomerIdFromCheckoutSession(checkoutSessionId)
    if (!customerId) {
      return null
    }

    await this.usersService.patchUserMetaData(user!.id, {
      customerId: customerId as string,
      checkoutSessionId: null,
    })
    return user
  }
}
