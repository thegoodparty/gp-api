import {
  BadGatewayException,
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common'
import { StripeService } from '../../vendors/stripe/services/stripe.service'
import { CheckoutSessionMode, WebhookEventType } from '../payments.types'
import Stripe from 'stripe'
import { CampaignsService } from '../../campaigns/services/campaigns.service'
import { UsersService } from '../../users/services/users.service'
import { SlackService } from '../../vendors/slack/services/slack.service'
import { Campaign, User } from '@prisma/client'
import { DateFormats, formatDate } from '../../shared/util/date.util'
import { getUserFullName } from '../../users/util/users.util'
import { EmailService } from '../../email/email.service'
import { EmailTemplateName } from '../../email/email.types'
import { SlackChannel } from '../../vendors/slack/slackService.types'
import { IS_PROD } from 'src/shared/util/appEnvironment.util'
import { CrmCampaignsService } from '../../campaigns/services/crmCampaigns.service'
import { VoterFileDownloadAccessService } from '../../shared/services/voterFileDownloadAccess.service'
import { parseCampaignElectionDate } from '../../campaigns/util/parseCampaignElectionDate.util'
import { AnalyticsService } from 'src/analytics/analytics.service'
import { PurchaseService } from './purchase.service'

const { STRIPE_WEBSOCKET_SECRET } = process.env
if (!STRIPE_WEBSOCKET_SECRET) {
  throw new Error('Please set STRIPE_WEBSOCKET_SECRET in your .env')
}

@Injectable()
export class PaymentEventsService {
  private readonly logger = new Logger(PaymentEventsService.name)

  constructor(
    private readonly usersService: UsersService,
    private readonly campaignsService: CampaignsService,
    private readonly slackService: SlackService,
    private readonly emailService: EmailService,
    private readonly crm: CrmCampaignsService,
    private readonly voterFileDownloadAccess: VoterFileDownloadAccessService,
    private readonly stripeService: StripeService,
    private readonly analytics: AnalyticsService,
    @Inject(forwardRef(() => PurchaseService))
    private readonly purchaseService: PurchaseService,
  ) {}

  async handleEvent(event: Stripe.Event) {
    switch (event.type) {
      case WebhookEventType.CustomerSubscriptionCreated:
        return await this.customerSubscriptionCreatedHandler(event)
      case WebhookEventType.CheckoutSessionCompleted:
        return await this.checkoutSessionCompletedHandler(event)
      case WebhookEventType.CheckoutSessionExpired:
        return await this.checkoutSessionExpiredHandler(event)
      case WebhookEventType.CustomerSubscriptionDeleted:
        return await this.customerSubscriptionDeletedHandler(event)
      case WebhookEventType.CustomerSubscriptionUpdated:
        return await this.customerSubscriptionUpdatedHandler(event)
      case WebhookEventType.CustomerSubscriptionResumed:
        return await this.customerSubscriptionResumedHandler(event)
    }
    this.logger.warn(`Stripe Event type ${event.type} not handled`)
  }

  async customerSubscriptionCreatedHandler(
    event: Stripe.CustomerSubscriptionCreatedEvent,
  ) {
    const { id: subscriptionId, customer: customerId } = event.data.object
    if (!subscriptionId) {
      throw new BadRequestException('No subscriptionId found in subscription')
    }

    const user = await this.usersService.findByCustomerId(customerId as string)
    if (!user) {
      throw new BadGatewayException(
        'No user found with given subscription customerId',
      )
    }
    const campaign = await this.campaignsService.findByUserId(user.id)
    if (!campaign) {
      throw new BadGatewayException(
        'No campaign found associated with given customerId',
      )
    }

    const { id: campaignId, details: campaignDetails } = campaign

    return this.campaignsService.update({
      where: { id: campaignId },
      data: {
        details: {
          ...campaignDetails,
          subscriptionId,
        },
      },
    })
  }

  async customerSubscriptionResumedHandler(
    event: Stripe.CustomerSubscriptionResumedEvent,
  ) {
    const subscription = event.data.object
    const { customer: customerId, id: subscriptionId } = subscription
    if (!customerId) {
      throw new BadRequestException('No customerId found in subscription')
    }

    const user = await this.usersService.findByCustomerId(customerId as string)
    if (!user) {
      throw new BadGatewayException(
        'No user found with given subscription customerId',
      )
    }
    const campaign = await this.campaignsService.findByUserId(user.id, {
      pathToVictory: true,
    })
    if (!campaign) {
      throw new BadGatewayException(
        'No campaign found associated with given customerId',
      )
    }
    const { id: campaignId } = campaign

    // These have to happen in serial since setIsPro also mutates the JSONP details column
    await this.campaignsService.patchCampaignDetails(campaignId, {
      subscriptionId: subscriptionId as string,
    })
    await this.campaignsService.setIsPro(campaignId)

    await Promise.allSettled([
      this.sendProSubscriptionResumedSlackMessage(user, campaign),
      this.sendProConfirmationEmail(user, campaign),
      this.voterFileDownloadAccess.downloadAccessAlert(campaign, user),
    ])
  }

  async customerSubscriptionUpdatedHandler(
    event: Stripe.CustomerSubscriptionUpdatedEvent,
  ): Promise<void> {
    const { previous_attributes: previousAttributes, object: subscription } =
      event.data
    const {
      id: subscriptionId,
      canceled_at: canceledAt,
      cancel_at: cancelAt,
    } = subscription
    const { cancel_at: previousCancelAt } = previousAttributes || {}

    if (!subscriptionId) {
      throw new BadRequestException('No subscriptionId found in subscription')
    }

    const campaign =
      await this.campaignsService.findBySubscriptionId(subscriptionId)
    if (!campaign) {
      throw new BadGatewayException('No campaign found with given subscription')
    }

    await this.campaignsService.patchCampaignDetails(campaign.id, {
      subscriptionCanceledAt: canceledAt,
      subscriptionCancelAt: cancelAt,
    })

    const user = (await this.usersService.findByCampaign(campaign)) as User
    const isCancellationRequest =
      cancelAt && previousCancelAt && previousCancelAt > cancelAt
    isCancellationRequest &&
      (await this.emailService.sendCancellationRequestConfirmationEmail(
        user,
        formatDate(new Date((cancelAt as number) * 1000), DateFormats.usDate),
      ))
  }

  async checkoutSessionCompletedHandler(
    event: Stripe.CheckoutSessionCompletedEvent,
  ) {
    const session = event.data.object
    const { mode } = session

    // Route to appropriate handler based on checkout session mode
    if (mode === CheckoutSessionMode.SUBSCRIPTION) {
      return this.handleSubscriptionCheckoutCompleted(session)
    } else if (mode === CheckoutSessionMode.PAYMENT) {
      return this.handleOneTimePaymentCheckoutCompleted(session)
    }

    this.logger.warn(`Unknown checkout session mode: ${mode}`)
  }

  /**
   * Handles checkout.session.completed events for subscription checkouts (Pro plan).
   */
  private async handleSubscriptionCheckoutCompleted(
    session: Stripe.Checkout.Session,
  ) {
    const { customer: customerId, subscription: subscriptionId } = session
    if (!customerId) {
      throw new BadGatewayException('No customerId found in checkout session')
    }

    const { userId } = session.metadata ? session.metadata : {}
    if (!userId) {
      throw new BadGatewayException(
        'No userId found in checkout session metadata',
      )
    }

    const user = await this.usersService.findUser({
      id: parseInt(userId),
    })

    if (!user) {
      throw new BadRequestException(
        'No user found with given checkout session userId',
      )
    }
    const campaign = await this.campaignsService.findByUserId(user.id, {
      pathToVictory: true,
    })
    if (!campaign) {
      throw new BadRequestException('No campaign found for user')
    }

    const { id: campaignId } = campaign
    const electionDate = parseCampaignElectionDate(campaign)
    if (!electionDate || electionDate < new Date()) {
      throw new BadGatewayException(
        'No electionDate or electionDate is in the past',
      )
    }

    // These have to happen in serial since setIsPro also mutates the JSONP details column
    await this.campaignsService.patchCampaignDetails(campaignId, {
      subscriptionId: subscriptionId as string,
    })
    await this.campaignsService.setIsPro(campaignId)

    // Track analytics with proper error handling
    try {
      await this.analytics.trackProPayment(user.id, session)
    } catch (error) {
      this.logger.error(
        `[WEBHOOK] Failed to track pro payment analytics - User: ${user.id}, Session: ${session.id}`,
        error,
      )
      // Don't throw - we don't want to fail the webhook for analytics issues
    }

    // Critical: Update user metadata with customerId - must succeed
    await this.usersService.patchUserMetaData(user.id, {
      customerId: customerId as string,
      checkoutSessionId: null,
    })

    // Non-critical: Send notifications - log failures but don't fail webhook
    const results = await Promise.allSettled([
      this.sendProSignUpSlackMessage(user, campaign),
      this.sendProConfirmationEmail(user, campaign),
      this.voterFileDownloadAccess.downloadAccessAlert(campaign, user),
    ])

    // Log any notification failures
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        const action = [
          'send Slack message',
          'send email',
          'send voter file alert',
        ][index]
        this.logger.error(
          `[WEBHOOK] Failed to ${action} - User: ${user.id}, CustomerId: ${customerId}`,
          result.reason,
        )
      }
    })
  }

  /**
   * Handles checkout.session.completed events for one-time payment checkouts.
   * Routes to the appropriate post-purchase handler based on purchaseType in metadata.
   *
   * This handler is used for Custom Checkout Sessions created with `ui_mode: 'custom'`
   * that support promo codes.
   */
  private async handleOneTimePaymentCheckoutCompleted(
    session: Stripe.Checkout.Session,
  ) {
    const { id: sessionId, metadata } = session

    if (!metadata?.userId) {
      throw new BadGatewayException(
        'No userId found in checkout session metadata',
      )
    }

    if (!metadata?.purchaseType) {
      throw new BadGatewayException(
        'No purchaseType found in checkout session metadata',
      )
    }

    this.logger.log(
      JSON.stringify({
        sessionId,
        purchaseType: metadata.purchaseType,
        userId: metadata.userId,
        msg: 'Processing one-time payment checkout session completion',
      }),
    )

    // Delegate to purchase service for post-purchase processing
    try {
      await this.purchaseService.completeCheckoutSession({
        checkoutSessionId: sessionId,
      })
    } catch (error) {
      this.logger.error(
        `[WEBHOOK] Failed to complete checkout session - Session: ${sessionId}, PurchaseType: ${metadata.purchaseType}`,
        error,
      )
      throw error
    }
  }

  async checkoutSessionExpiredHandler(
    event: Stripe.CheckoutSessionExpiredEvent,
  ): Promise<void> {
    const session = event.data.object
    const { userId } = session.metadata ? session.metadata : {}
    if (!userId) {
      throw new BadRequestException(
        'No userId found in expired checkout session metadata',
      )
    }

    await this.usersService.patchUserMetaData(parseInt(userId), {
      checkoutSessionId: null,
    })
  }

  async customerSubscriptionDeletedHandler(
    event: Stripe.CustomerSubscriptionDeletedEvent,
  ): Promise<void> {
    const subscription = event.data.object
    const { id: subscriptionId } = subscription
    if (!subscriptionId) {
      throw 'No subscriptionId found in subscription'
    }

    const campaign =
      await this.campaignsService.findBySubscriptionId(subscriptionId)

    if (!campaign) {
      throw new BadGatewayException(
        `No campaign found with given subscriptionId => ${subscriptionId}`,
      )
    }

    const user = await this.usersService.findUser({
      id: campaign.userId as number,
    })
    if (!user) {
      throw new InternalServerErrorException(
        `No user found with given campaign user id => ${campaign.userId}`,
      )
    }
    const { metaData } = user
    if (metaData?.isDeleted) {
      this.logger.log('User is already deleted')
      return
    }

    await this.campaignsService.persistCampaignProCancellation(campaign)
    await this.campaignsService.patchCampaignDetails(campaign.id, {
      subscriptionCanceledAt: Date.now(),
    })
    await this.sendProCancellationSlackMessage(user, campaign)
  }

  async sendProCancellationSlackMessage(user: User, campaign: Campaign) {
    const { details = {} } = campaign || {}
    const { office, otherOffice } = details
    const fullName = getUserFullName(user)

    await this.slackService.message(
      {
        body: `PRO PLAN CANCELLATION: \`${fullName}\` w/ email ${
          user.email
        }, running for '${otherOffice || office}' and campaign slug \`${
          campaign.slug
        }\` ended their pro subscription!`,
      },
      IS_PROD ? SlackChannel.botPolitics : SlackChannel.botDev,
    )
  }

  async sendProSubscriptionResumedSlackMessage(user: User, campaign: Campaign) {
    await this.slackService.message(
      {
        body: `PRO PLAN RESUMED: \`${getUserFullName(user)}\` w/ email ${user.email} and campaign slug \`${campaign.slug}\` RESUMED their pro subscription!`,
      },
      IS_PROD ? SlackChannel.botPolitics : SlackChannel.botDev,
    )
  }

  async sendProSignUpSlackMessage(user: User, campaign: Campaign) {
    const { details = {}, data = {} } = campaign || {}
    const { office, otherOffice, state } = details
    const { hubspotId } = data
    const name = `${user.firstName}${user.firstName ? ` ${user.lastName}` : ''}`

    await this.slackService.message(
      {
        body: `PRO PLAN SIGN UP!!! :gp:
          Name: ${name}
          Email: ${user.email}
          Campaign slug: ${campaign.slug}
          State: ${state}
          Office: ${office || otherOffice}
          Assigned PA: ${
            hubspotId
              ? await this.crm.getCrmCompanyOwnerName(hubspotId)
              : 'None assigned'
          }
          ${
            hubspotId
              ? `https://app.hubspot.com/contacts/21589597/record/0-2/${hubspotId}`
              : 'No CRM company found'
          }
        `,
      },
      IS_PROD ? SlackChannel.botPolitics : SlackChannel.botDev,
    )
  }

  async sendProConfirmationEmail(user: User, campaign: Campaign) {
    const { details: campaignDetails } = campaign
    const { electionDate: ISO8601DateString } = campaignDetails

    const formattedCurrentDate = formatDate(new Date(), DateFormats.isoDate)
    const electionDate =
      ISO8601DateString && formatDate(ISO8601DateString, DateFormats.usDate)

    const emailVars = {
      userFullName: getUserFullName(user),
      startDate: formattedCurrentDate,
      ...(electionDate ? { electionDate } : {}),
    }

    try {
      await this.emailService.sendTemplateEmail({
        to: user.email,
        subject: `Welcome to Pro! Let's Empower Your Campaign Together`,
        template: EmailTemplateName.proConfirmation,
        variables: emailVars,
      })
    } catch (e) {
      this.logger.error('Error sending pro confirmation email', e)
      throw e
    }
  }
}
