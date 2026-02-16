import { ReqCampaign } from '@/campaigns/decorators/ReqCampaign.decorator'
import { UseCampaign } from '@/campaigns/decorators/UseCampaign.decorator'
import {
  BadRequestException,
  Body,
  Controller,
  Logger,
  Post,
} from '@nestjs/common'
import { Campaign, User } from '@prisma/client'
import { serializeError } from 'serialize-error'
import { ReqUser } from '../authentication/decorators/ReqUser.decorator'
import { UsersService } from '../users/services/users.service'
import { StripeService } from '../vendors/stripe/services/stripe.service'
import {
  CompleteCheckoutSessionDto,
  CompletePurchaseDto,
  CreateCheckoutSessionDto,
  CreatePurchaseIntentDto,
} from './purchase.types'
import { PurchaseService } from './services/purchase.service'

@Controller('payments/purchase')
export class PurchaseController {
  private readonly logger = new Logger(PurchaseController.name)
  constructor(
    private readonly stripeService: StripeService,
    private readonly usersService: UsersService,
    private readonly purchaseService: PurchaseService,
  ) {}

  @Post('checkout-session')
  async createProCheckoutSession(@ReqUser() user: User) {
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
      throw new BadRequestException({
        message: 'User does not have a customerId',
        errorCode: 'BILLING_CUSTOMER_ID_MISSING',
      })
    }
    const { url: redirectUrl } =
      await this.stripeService.createPortalSession(customerId)
    return { redirectUrl }
  }

  @Post('create-intent')
  @UseCampaign()
  async createPurchaseIntent(
    @ReqUser() user: User,
    @Body() dto: CreatePurchaseIntentDto<unknown>,
    @ReqCampaign() campaign: Campaign,
  ) {
    try {
      const result = await this.purchaseService.createPurchaseIntent({
        user,
        dto,
        campaign,
      })
      return result
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          err: serializeError(error),
          user: user.id,
          campaign,
          dto,
          msg: 'Error creating purchase intent',
        }),
      )
      throw error
    }
  }

  /**
   * Creates a Custom Checkout Session for one-time payments with promo code support.
   * This is the new preferred method for purchases that should support promo codes.
   *
   * Migration reference: https://docs.stripe.com/payments/payment-element/migration-ewcs
   */
  @Post('create-checkout-session')
  @UseCampaign()
  async createCheckoutSession(
    @ReqUser() user: User,
    @Body() dto: CreateCheckoutSessionDto<unknown>,
    @ReqCampaign() campaign: Campaign,
  ) {
    try {
      const result = await this.purchaseService.createCheckoutSession({
        user,
        dto,
        campaign,
      })
      return result
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          err: serializeError(error),
          user: user.id,
          campaign,
          dto,
          msg: 'Error creating checkout session',
        }),
      )
      throw error
    }
  }

  @Post('complete')
  async completePurchase(@Body() dto: CompletePurchaseDto) {
    return this.purchaseService.completePurchase(dto)
  }

  /**
   * Completes a purchase made via Checkout Session.
   * Called after the user completes payment and is redirected back.
   */
  @Post('complete-checkout-session')
  async completeCheckoutSession(@Body() dto: CompleteCheckoutSessionDto) {
    return this.purchaseService.completeCheckoutSession(dto)
  }
}
