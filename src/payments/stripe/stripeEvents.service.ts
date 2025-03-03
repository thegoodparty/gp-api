import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotImplementedException,
} from '@nestjs/common'
import { StripeSingleton } from './stripe.service'
import { WebhookEventType } from '../payments.types'
import Stripe from 'stripe'
import { CampaignsService } from '../../campaigns/services/campaigns.service'
import { UsersService } from '../../users/services/users.service'
import { SlackService } from '../../shared/services/slack.service'
import { Campaign, User } from '@prisma/client'
import { DateFormats, formatDate } from '../../shared/util/date.util'
import { getUserFullName } from '../../users/util/users.util'
import { EmailService } from '../../email/email.service'
import { EmailTemplateNames } from '../../email/email.types'
import { SlackChannel } from '../../shared/services/slackService.types'
import { IS_PROD } from 'src/shared/util/appEnvironment.util'
import { CrmCampaignsService } from '../../campaigns/services/crmCampaigns.service'
import { VoterFileDownloadAccessService } from '../../shared/services/voterFileDownloadAccess.service'

const { STRIPE_WEBSOCKET_SECRET } = process.env
if (!STRIPE_WEBSOCKET_SECRET) {
  throw new Error('Please set STRIPE_WEBSOCKET_SECRET in your .env')
}

@Injectable()
export class StripeEventsService {
  private readonly logger = new Logger(StripeEventsService.name)
  private stripe = StripeSingleton

  constructor(
    private readonly usersService: UsersService,
    private readonly campaignsService: CampaignsService,
    private readonly slackService: SlackService,
    private readonly emailService: EmailService,
    private readonly crm: CrmCampaignsService,
    private readonly voterFileDownloadAccess: VoterFileDownloadAccessService,
  ) {}

  async parseWebhookEvent(rawBody: Buffer, stripeSignature: string) {
    return this.stripe.webhooks.constructEvent(
      rawBody,
      stripeSignature,
      STRIPE_WEBSOCKET_SECRET as string,
    )
  }

  async handleEvent(event: Stripe.Event) {
    switch (event.type) {
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
    throw new NotImplementedException('event type not supported')
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

    await Promise.allSettled([
      this.campaignsService.patchCampaignDetails(campaignId, {
        subscriptionId: subscriptionId as string,
      }),
      this.campaignsService.setIsPro(campaignId),
      this.sendProSubscriptionResumedSlackMessage(user, campaign),
      this.sendProConfirmationEmail(user, campaign),
      this.voterFileDownloadAccess.downloadAccessAlert(campaign, user),
    ])
  }

  async customerSubscriptionUpdatedHandler(
    event: Stripe.CustomerSubscriptionUpdatedEvent,
  ): Promise<void> {
    const subscription = event.data.object
    const {
      id: subscriptionId,
      canceled_at: canceledAt,
      cancel_at: cancelAt,
    } = subscription
    if (!subscriptionId) {
      throw new BadRequestException('No subscriptionId found in subscription')
    }

    const campaign =
      await this.campaignsService.findBySubscriptionId(subscriptionId)
    if (!campaign) {
      throw new BadGatewayException('No campaign found with given subscription')
    }

    const user = (await this.usersService.findByCampaign(campaign)) as User

    const { details } = campaign
    const isCancellationRequest = canceledAt && !details.subscriptionCanceledAt

    await this.campaignsService.patchCampaignDetails(campaign.id, {
      subscriptionCanceledAt: canceledAt,
      subscriptionCancelAt: cancelAt,
    })

    isCancellationRequest &&
      (await this.emailService.sendCancellationRequestConfirmationEmail(
        user,
        formatDate(new Date((cancelAt as number) * 1000), DateFormats.usDate),
      ))
  }

  /*
example of payload for checkoutSessionCompleted


  */

  example = {
    id: 'evt_1QyIp71taBPnTqn4J3ifbpip',
    object: 'event',
    api_version: '2024-04-10',
    created: 1740946156,
    data: {
      object: {
        id: 'cs_live_a1IWtbtibvQETiVXpj8uW2x6jd96RS18FJkJhIPvN8s2NSk7r4ZtS3Mn7c',
        object: 'checkout.session',
        adaptive_pricing: null,
        after_expiration: null,
        allow_promotion_codes: null,
        amount_subtotal: 1000,
        amount_total: 1000,
        automatic_tax: {
          enabled: false,
          liability: null,
          status: null,
        },
        billing_address_collection: 'auto',
        cancel_url: 'https://goodparty.org/dashboard',
        client_reference_id: null,
        client_secret: null,
        collected_information: {
          shipping_details: null,
        },
        consent: null,
        consent_collection: null,
        created: 1740946011,
        currency: 'usd',
        currency_conversion: null,
        custom_fields: [],
        custom_text: {
          after_submit: null,
          shipping_address: null,
          submit: null,
          terms_of_service_acceptance: null,
        },
        customer: 'cus_Rs2uoyL5hweBWb',
        customer_creation: 'always',
        customer_details: {
          address: {
            city: null,
            country: 'US',
            line1: null,
            line2: null,
            postal_code: '37035',
            state: null,
          },
          email: 'lurchbulldog+pro-new-stack@gmail.com',
          name: 'Matthew H Marcus',
          phone: null,
          tax_exempt: 'none',
          tax_ids: [],
        },
        customer_email: null,
        discounts: [],
        expires_at: 1741032411,
        invoice: 'in_1QyIp21taBPnTqn4IA7AGIPF',
        invoice_creation: null,
        livemode: true,
        locale: null,
        metadata: {
          userId: '32404',
        },
        mode: 'subscription',
        payment_intent: null,
        payment_link: null,
        payment_method_collection: 'always',
        payment_method_configuration_details: {
          id: 'pmc_1PMFDW1taBPnTqn4x8r4m5nW',
          parent: null,
        },
        payment_method_options: {
          card: {
            request_three_d_secure: 'automatic',
          },
        },
        payment_method_types: ['card', 'link', 'cashapp'],
        payment_status: 'paid',
        phone_number_collection: {
          enabled: false,
        },
        recovered_from: null,
        saved_payment_method_options: {
          allow_redisplay_filters: ['always'],
          payment_method_remove: null,
          payment_method_save: null,
        },
        setup_intent: null,
        shipping_address_collection: null,
        shipping_cost: null,
        shipping_options: [],
        status: 'complete',
        submit_type: null,
        subscription: 'sub_1QyIp21taBPnTqn4rn6Yf4NI',
        success_url:
          'https://goodparty.org/dashboard/pro-sign-up/success?session_id={CHECKOUT_SESSION_ID}',
        total_details: {
          amount_discount: 0,
          amount_shipping: 0,
          amount_tax: 0,
        },
        ui_mode: 'hosted',
        url: null,
      },
    },
    livemode: true,
    pending_webhooks: 1,
    request: {
      id: null,
      idempotency_key: null,
    },
    type: 'checkout.session.completed',
  }

  async checkoutSessionCompletedHandler(
    event: Stripe.CheckoutSessionCompletedEvent,
  ): Promise<void> {
    const session = event.data.object
    const { customer: customerId, subscription } = session
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

    await Promise.allSettled([
      this.usersService.patchUserMetaData(user.id, {
        customerId: customerId as string,
        checkoutSessionId: null,
      }),
      this.campaignsService.patchCampaignDetails(campaignId, {
        subscriptionId: subscription as string,
      }),
      this.campaignsService.setIsPro(campaignId),
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
        template: EmailTemplateNames.proConfirmation,
        variables: emailVars,
      })
    } catch (e) {
      this.logger.error('Error sending pro confirmation email', e)
      throw e
    }
  }
}
