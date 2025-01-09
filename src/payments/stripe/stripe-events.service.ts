import {
  BadRequestException,
  Injectable,
  NotImplementedException,
} from '@nestjs/common'
import { StripeSingleton } from './stripe.service'
import { checkoutSessionExpiredHandler } from '../eventHandlers/checkoutSessionExpiredHandler'
import { customerSubscriptionDeletedHandler } from '../eventHandlers/customerSubscriptionDeletedHandler'
import { customerSubscriptionUpdatedHandler } from '../eventHandlers/customerSubscriptionUpdatedHandler'
import { customerSubscriptionResumedHandler } from '../eventHandlers/customerSubscriptionResumedHandler'
import {
  StripeCheckoutSessionCompletedEventWithMetadata,
  WebhookEventType,
} from '../payments.types'
import Stripe from 'stripe'
import { CampaignsService } from '../../campaigns/services/campaigns.service'
import { UsersService } from '../../users/users.service'
import { SlackService } from '../../shared/services/slack.service'
import { Campaign, User } from '@prisma/client'

const { STRIPE_WEBSOCKET_SECRET } = process.env

@Injectable()
export class StripeEventsService {
  private stripe = StripeSingleton
  private readonly webhookHandlers = {
    [WebhookEventType.CheckoutSessionCompleted]:
      this.checkoutSessionCompletedHandler,
    [WebhookEventType.CheckoutSessionExpired]: checkoutSessionExpiredHandler,
    [WebhookEventType.CustomerSubscriptionDeleted]:
      customerSubscriptionDeletedHandler,
    [WebhookEventType.CustomerSubscriptionUpdated]:
      customerSubscriptionUpdatedHandler,
    [WebhookEventType.CustomerSubscriptionResumed]:
      customerSubscriptionResumedHandler,
  }

  constructor(
    private readonly usersService: UsersService,
    private readonly campaignsService: CampaignsService,
    private readonly slackService: SlackService,
  ) {}

  async parseWebhookEvent(rawBody: Buffer, stripeSignature: string) {
    return this.stripe.webhooks.constructEvent(
      rawBody,
      stripeSignature,
      STRIPE_WEBSOCKET_SECRET as string,
    )
  }

  async handleEvent(event: Stripe.Event) {
    if (!this.webhookHandlers[event.type]) {
      throw new NotImplementedException('event type not supported')
    }
  }

  async checkoutSessionCompletedHandler(
    event: StripeCheckoutSessionCompletedEventWithMetadata,
  ): Promise<void> {
    const session = event.data.object
    const { customer: customerId, subscription: subscriptionId } = session
    if (!customerId) {
      throw 'No customerId found in checkout session'
    }

    const { userId } = session.metadata
    if (!userId) {
      throw 'No userId found in checkout session metadata'
    }

    const user = await this.usersService.findUser({
      id: userId,
    })

    if (!user) {
      throw new BadRequestException(
        'No user found with given checkout session userId',
      )
    }
    const campaign = await this.campaignsService.findByUser(user.id)
    if (!campaign) {
      throw new BadRequestException('No campaign found for user')
    }

    const { id: campaignId } = campaign

    await Promise.allSettled([
      this.usersService.patchUserMetaData(user, {
        customerId: customerId as string,
        checkoutSessionId: null,
      }),
      this.campaignsService.patchCampaignDetails(campaignId, {
        subscriptionId,
      }),
      this.campaignsService.update(campaignId, {
        isPro: true,
      }),
      this.campaignsService.setIsPro(campaignId),
      this.sendProSignUpSlackMessage(user, campaign),
      sendProConfirmationEmail(user, campaign),
      doVoterDownloadCheck(campaign),
    ])
  }

  async sendProSignUpSlackMessage(user: User, campaign: Campaign) {
    const { details = {} } = campaign || {}
    const { office, otherOffice, state } = details
    const name = `${user.firstName}${user.firstName ? ` ${user.lastName}` : ''}`
    // TODO: get CRM company
    // const crmCompany = await sails.helpers.crm.getCompany(campaign)

    await this.slackService.message(
      {
        title: 'New Pro User!',
        body: `PRO PLAN SIGN UP!!! :gp:
          Name: ${name}
          Email: ${user.email}
          Campaign slug: ${campaign.slug}
          State: ${state}
          Office: ${office || otherOffice}
          Assigned PA: ${
            // TODO: get CRM company owner name
            // (await getCrmCompanyOwnerName(crmCompany)) ||
            'None assigned'
          }
          ${
            // TODO: get CRM company URL
            // crmCompany?.id
            //   ? `https://app.hubspot.com/contacts/21589597/record/0-2/${crmCompany.id}` :
            'No CRM company found'
          }
        `,
      },
      // TODO: implement appEnvironment service
      // appEnvironment === PRODUCTION_ENV ? 'politics' : 'dev',
      'dev',
    )
  }

  async sendProConfirmationEmail(user: User, campaign: Campaign) {
    const { details: campaignDetails } = campaign
    const { electionDate: ISO8601DateString } = campaignDetails

    const formattedCurrentDate = getFormattedDateString(new Date())
    const electionDate =
      ISO8601DateString &&
      formatUSDateString(
        convertISO8601DateStringToUSDateString(ISO8601DateString),
      )

    const emailVars = {
      userFullName: await sails.helpers.user.name(user),
      startDate: formattedCurrentDate,
      ...(electionDate ? { electionDate } : {}),
    }

    try {
      await sails.helpers.mailgun.mailgunTemplateSender(
        user.email,
        `Welcome to Pro! Let's Empower Your Campaign Together`,
        'pro-confirmation',
        emailVars,
      )
    } catch (e) {
      await sails.helpers.slack.errorLoggerHelper(
        'Error sending pro confirmation email',
        e,
      )
    }
  }
}
