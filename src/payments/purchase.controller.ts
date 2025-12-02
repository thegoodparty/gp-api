import { BadRequestException, Body, Controller, Post } from '@nestjs/common'
import { User } from '@prisma/client'
import { ReqUser } from '../authentication/decorators/ReqUser.decorator'
import { UsersService } from '../users/services/users.service'
import { StripeService } from '../vendors/stripe/services/stripe.service'
import { CompletePurchaseDto, CreatePurchaseIntentDto } from './purchase.types'
import { PurchaseService } from './services/purchase.service'

@Controller('payments/purchase')
export class PurchaseController {
  constructor(
    private readonly stripeService: StripeService,
    private readonly usersService: UsersService,
    private readonly purchaseService: PurchaseService,
  ) {}

  @Post('checkout-session')
  async createCheckoutSession(@ReqUser() user: User) {
    const { redirectUrl, checkoutSessionId } =
      await this.stripeService.createCheckoutSession(user.id)

    await this.usersService.patchUserMetaData(user.id, { checkoutSessionId })

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

  @Post('create-intent')
  async createPurchaseIntent(
    @ReqUser() user: User,
    @Body() dto: CreatePurchaseIntentDto<unknown>,
  ) {
    return this.purchaseService.createPurchaseIntent(user, dto)
  }

  @Post('complete')
  async completePurchase(@Body() dto: CompletePurchaseDto) {
    return this.purchaseService.completePurchase(dto)
  }
}
