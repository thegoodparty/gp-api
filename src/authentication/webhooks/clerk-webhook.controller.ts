import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  InternalServerErrorException,
  Post,
  RawBodyRequest,
  Req,
  UnauthorizedException,
} from '@nestjs/common'
import { PinoLogger } from 'nestjs-pino'
import { Webhook } from 'svix'
import { PublicAccess } from '@/authentication/decorators/PublicAccess.decorator'
import { ClerkWebhookService } from './clerk-webhook.service'

interface ClerkEmailAddress {
  email_address: string
  id: string
}

interface ClerkWebhookEventData {
  id: string
  email_addresses?: ClerkEmailAddress[]
  first_name?: string | null
  last_name?: string | null
}

interface ClerkWebhookPayload {
  type: string
  data: ClerkWebhookEventData
}

@Controller('webhooks')
export class ClerkWebhookController {
  constructor(
    private readonly clerkWebhookService: ClerkWebhookService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ClerkWebhookController.name)
  }

  @Post('clerk')
  @PublicAccess()
  @HttpCode(HttpStatus.OK)
  async handleClerkWebhook(
    @Req() { rawBody }: RawBodyRequest<Request>,
    @Headers() headers: Record<string, string>,
  ) {
    const webhookSecret = process.env.CLERK_WEBHOOK_SECRET
    if (!webhookSecret) {
      this.logger.error('CLERK_WEBHOOK_SECRET is not configured')
      throw new InternalServerErrorException('Webhook secret not configured')
    }

    if (!rawBody) {
      throw new BadRequestException('Missing request body')
    }

    const svixId = headers['svix-id']
    const svixTimestamp = headers['svix-timestamp']
    const svixSignature = headers['svix-signature']

    if (!svixId || !svixTimestamp || !svixSignature) {
      throw new BadRequestException('Missing svix headers')
    }

    let event: ClerkWebhookPayload
    try {
      const wh = new Webhook(webhookSecret)
      event = wh.verify(rawBody.toString(), {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': svixSignature,
      }) as ClerkWebhookPayload
    } catch (err) {
      this.logger.warn({ err }, 'Failed to verify Clerk webhook signature')
      throw new UnauthorizedException('Invalid webhook signature')
    }

    this.logger.info(
      { eventType: event.type },
      'Processing Clerk webhook event',
    )

    switch (event.type) {
      case 'user.created':
        await this.clerkWebhookService.handleUserCreated(event.data)
        break
      case 'user.updated':
        await this.clerkWebhookService.handleUserUpdated(event.data)
        break
      case 'user.deleted':
        await this.clerkWebhookService.handleUserDeleted(event.data)
        break
      default:
        this.logger.debug(
          { eventType: event.type },
          'Unhandled Clerk webhook event type',
        )
    }

    return { received: true }
  }
}
