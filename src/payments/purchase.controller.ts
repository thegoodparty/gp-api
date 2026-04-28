import { ReqCampaign } from '@/campaigns/decorators/ReqCampaign.decorator'
import { UseCampaign } from '@/campaigns/decorators/UseCampaign.decorator'
import { BadRequestException, Body, Controller, Post } from '@nestjs/common'
import { Campaign, Organization, User } from '@prisma/client'
import { PinoLogger } from 'nestjs-pino'
import { serializeError } from 'serialize-error'
import { ReqUser } from '../authentication/decorators/ReqUser.decorator'
import { CampaignsService } from '../campaigns/services/campaigns.service'
import { isDateTodayOrFuture } from '../shared/util/date.util'
import { UsersService } from '../users/services/users.service'
import { StripeService } from '../vendors/stripe/services/stripe.service'
import {
  CompleteCheckoutSessionDto,
  CompleteFreePurchaseDto,
  CreateCheckoutSessionDto,
} from './purchase.types'
import { PurchaseService } from './services/purchase.service'
import { UseOrganization } from '@/organizations/decorators/UseOrganization.decorator'
import { ReqOrganization } from '@/organizations/decorators/ReqOrganization.decorator'

@Controller('payments/purchase')
export class PurchaseController {
  constructor(
    private readonly stripeService: StripeService,
    private readonly usersService: UsersService,
    private readonly campaignsService: CampaignsService,
    private readonly purchaseService: PurchaseService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(PurchaseController.name)
  }

  @Post('checkout-session')
  async createProCheckoutSession(@ReqUser() user: User) {
    const { email } = user

    // Block checkout up front when normal Pro activation cannot proceed cleanly,
    // rather than letting Stripe charge the customer and forcing webhook recovery
    // for a subscription that needs manual triage (ENG-7570).
    const campaign = await this.campaignsService.findByUserId(user.id)
    if (!campaign) {
      throw new BadRequestException({
        message: 'No campaign found for user',
        errorCode: 'CAMPAIGN_NOT_FOUND',
      })
    }
    if (!isDateTodayOrFuture(campaign.details?.electionDate)) {
      throw new BadRequestException({
        message:
          'Campaign election date is missing or in the past. Update your election date before renewing Pro.',
        errorCode: 'CAMPAIGN_ELECTION_DATE_INVALID',
      })
    }

    const { redirectUrl, checkoutSessionId } =
      await this.stripeService.createCheckoutSession(user.id, email)

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

  /**
   * Creates a Custom Checkout Session for one-time payments with promo code support.
   * This is the new preferred method for purchases that should support promo codes.
   *
   * Migration reference: https://docs.stripe.com/payments/payment-element/migration-ewcs
   */
  @Post('create-checkout-session')
  @UseCampaign({ continueIfNotFound: true })
  @UseOrganization({ continueIfNotFound: true })
  async createCheckoutSession(
    @ReqUser() user: User,
    @Body() dto: CreateCheckoutSessionDto<unknown>,
    @ReqCampaign() campaign: Campaign | undefined,
    @ReqOrganization() organization: Organization | undefined,
  ) {
    if (!campaign && !organization) {
      throw new BadRequestException({
        message: 'Campaign or organization is required',
        errorCode: 'CAMPAIGN_OR_ORGANIZATION_REQUIRED',
      })
    }

    try {
      const result = await this.purchaseService.createCheckoutSession({
        user,
        dto,
        metadata: {
          campaignId: campaign?.id,
          organizationSlug: organization?.slug,
        },
      })
      return result
    } catch (error) {
      this.logger.error({
        err: serializeError(error),
        user: user.id,
        campaign,
        dto,
        msg: 'Error creating checkout session',
      })
      throw error
    }
  }

  /**
   * Completes a purchase made via Checkout Session.
   * Called after the user completes payment and is redirected back.
   */
  @Post('complete-checkout-session')
  async completeCheckoutSession(@Body() dto: CompleteCheckoutSessionDto) {
    return this.purchaseService.completeCheckoutSession(dto)
  }

  /**
   * Completes a zero-amount (free) purchase by executing post-purchase handlers.
   * Called when the user explicitly confirms a free purchase (e.g., clicks
   * "Schedule text" after the free texts offer covers the entire cost).
   * The campaignId is server-validated via @UseCampaign().
   */
  @Post('complete-free-purchase')
  @UseCampaign()
  async completeFreePurchase(
    @ReqUser() user: User,
    @Body() dto: CompleteFreePurchaseDto,
    @ReqCampaign() campaign?: Campaign,
  ) {
    try {
      return await this.purchaseService.completeFreePurchase({
        dto,
        campaign,
        user,
      })
    } catch (error) {
      this.logger.error({
        err: serializeError(error),
        campaign: campaign?.id,
        dto,
        msg: 'Error completing free purchase',
      })
      throw error
    }
  }
}
