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
import { UsersService } from '../../users/users.service'
import { SlackService } from '../../shared/services/slack.service'
import { Campaign, User } from '@prisma/client'
import { DateFormats, formatDate } from '../../shared/util/date.util'
import { getFullName } from '../../users/util/users.util'
import { EmailService } from '../../email/email.service'
import { EmailTemplateNames } from '../../email/email.types'
import { SlackChannel } from '../../shared/services/slackService.types'
import { VoterFileService } from 'src/voterData/voterFile/voterFile.service'
import { IS_PROD } from 'src/shared/util/appEnvironment.util'

const { STRIPE_WEBSOCKET_SECRET } = process.env

@Injectable()
export class StripeEventsService {
  private readonly logger = new Logger(StripeEventsService.name)
  private stripe = StripeSingleton

  constructor(
    private readonly usersService: UsersService,
    private readonly campaignsService: CampaignsService,
    private readonly slackService: SlackService,
    private readonly emailService: EmailService,
    private readonly voterFileService: VoterFileService,
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
    const campaign = await this.campaignsService.findByUser(user.id, {
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
      this.voterFileService.doVoterDownloadCheck(campaign, user),
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

  async checkoutSessionCompletedHandler(
    event: Stripe.CheckoutSessionCompletedEvent,
  ): Promise<void> {
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
    const campaign = await this.campaignsService.findByUser(user.id, {
      pathToVictory: true,
    })
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
        subscriptionId: subscriptionId as string,
      }),
      this.campaignsService.setIsPro(campaignId),
      this.sendProSignUpSlackMessage(user, campaign),
      this.sendProConfirmationEmail(user, campaign),
      this.voterFileService.doVoterDownloadCheck(campaign, user),
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

    const user = await this.usersService.findUser({ id: parseInt(userId) })
    if (!user) {
      throw new BadGatewayException(
        'No user found with given expired checkout session userId',
      )
    }
    await this.usersService.patchUserMetaData(user, { checkoutSessionId: null })
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
    const fullName = getFullName(user)

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
        body: `PRO PLAN RESUMED: \`${getFullName(user)}\` w/ email ${user.email} and campaign slug \`${campaign.slug}\` RESUMED their pro subscription!`,
      },
      IS_PROD ? SlackChannel.botPolitics : SlackChannel.botDev,
    )
  }

  async sendProSignUpSlackMessage(user: User, campaign: Campaign) {
    const { details = {} } = campaign || {}
    const { office, otherOffice, state } = details
    const name = `${user.firstName}${user.firstName ? ` ${user.lastName}` : ''}`
    // TODO: get CRM company
    // const crmCompany = await sails.helpers.crm.getCompany(campaign)

    await this.slackService.message(
      {
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
      userFullName: getFullName(user),
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
