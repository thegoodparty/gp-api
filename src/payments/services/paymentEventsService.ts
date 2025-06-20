import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common'
import { StripeService } from '../../stripe/services/stripe.service'
import { WebhookEventType } from '../payments.types'
import Stripe from 'stripe'
import { CampaignsService } from '../../campaigns/services/campaigns.service'
import { UsersService } from '../../users/services/users.service'
import { SlackService } from '../../shared/services/slack.service'
import { Campaign, User } from '@prisma/client'
import { DateFormats, formatDate } from '../../shared/util/date.util'
import { getUserFullName } from '../../users/util/users.util'
import { EmailService } from '../../email/email.service'
import { EmailTemplateName } from '../../email/email.types'
import { SlackChannel } from '../../shared/services/slackService.types'
import { IS_PROD } from 'src/shared/util/appEnvironment.util'
import { CrmCampaignsService } from '../../campaigns/services/crmCampaigns.service'
import { VoterFileDownloadAccessService } from '../../shared/services/voterFileDownloadAccess.service'
import { parseCampaignElectionDate } from '../../campaigns/util/parseCampaignElectionDate.util'
import { SegmentService } from 'src/segment/segment.service'
import { EVENTS } from 'src/segment/segment.types'

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
    private readonly segment: SegmentService,
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

    await Promise.allSettled([
      this.stripeService.setSubscriptionCancelAt(subscriptionId, electionDate),
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

    // The only way for us to determine if a user is resuming a subscription that
    //  they previously requested to cancel, but haven't reached the end of
    //  their pay period, is to do this check, and then reset the cancel_at date
    //  to the election date for their campaign.
    const isResumeEvent = !cancelAt && previousCancelAt
    if (isResumeEvent) {
      const electionDate = parseCampaignElectionDate(campaign)
      if (!electionDate || electionDate < new Date()) {
        throw new BadGatewayException(
          'No electionDate or electionDate is in the past',
        )
      }

      await this.stripeService.setSubscriptionCancelAt(
        subscriptionId,
        electionDate,
      )
    } else {
      await this.campaignsService.patchCampaignDetails(campaign.id, {
        subscriptionCanceledAt: canceledAt,
        subscriptionCancelAt: cancelAt,
      })
    }

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

    // For Segment
    const sub = session.subscription as Stripe.Subscription
    const price = sub.items.data[0].price
    const intent = session.payment_intent as Stripe.PaymentIntent
    const pm = intent.payment_method as Stripe.PaymentMethod

    const paymentMethod =
      pm.type === 'card' ? (pm.card?.wallet?.type ?? 'credit card') : pm.type

    this.segment.trackEvent(user.id, EVENTS.Account.ProSubscriptionConfirmed, {
      price: (price.unit_amount ?? 0) / 100,
      paymentMethod,
      renewalDate: new Date(sub.current_period_end * 1000).toISOString(),
    })

    return await Promise.allSettled([
      this.usersService.patchUserMetaData(user.id, {
        customerId: customerId as string,
        checkoutSessionId: null,
      }),
      this.stripeService.setSubscriptionCancelAt(
        subscriptionId as string,
        electionDate,
      ),
      this.sendProSignUpSlackMessage(user, campaign),
      this.sendProConfirmationEmail(user, campaign),
      this.voterFileDownloadAccess.downloadAccessAlert(campaign, user),
    ])
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
    await this.sendProCancellationSlackMessage(user, campaign)

    await this.emailService.sendProSubscriptionEndingEmail(user)
  }

  async sendProCancellationSlackMessage(user: User, campaign: Campaign) {
    const { details = {} } = campaign || {}
    if (details.endOfElectionSubscriptionCanceled) {
      return // don't send Slack message if subscription was canceled at end of election
    }
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
