import { BadRequestException, Controller, Post } from '@nestjs/common'
import { StripeService } from '../stripe/stripe.service'
import { ReqUser } from '../../authentication/decorators/ReqUser.decorator'
import { Prisma, User } from '@prisma/client'
import { UsersService } from '../../users/users.service'

@Controller('payments/purchase')
export class PurchaseController {
  constructor(
    private readonly stripeService: StripeService,
    private readonly usersService: UsersService,
  ) {}

  @Post('checkout-session')
  async createCheckoutSession(@ReqUser() user: User) {
    const { redirectUrl, checkoutSessionId } =
      await this.stripeService.createCheckoutSession(user.id)
    const currentUserMetaData = (user.metaData as Prisma.JsonObject) || {}

    await this.usersService.updateUser(
      {
        id: user.id,
      },
      {
        metaData: {
          ...currentUserMetaData,
          checkoutSessionId,
        },
      },
    )

    return { redirectUrl }
  }

  @Post('portal-session')
  async createPortalSession(@ReqUser() user: User) {
    const { metaData } = user
    const { customerId } = metaData || {}
    if (!customerId) {
      throw new BadRequestException('User does not have a customerId')
    }
    const { url: redirectUrl } =
      await this.stripeService.createPortalSession(customerId)
    return { redirectUrl }
  }
}
