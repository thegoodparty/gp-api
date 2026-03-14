import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  RawBodyRequest,
  Req,
  UnauthorizedException,
} from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { PinoLogger } from 'nestjs-pino'
import { Webhook } from 'svix'
import { PublicAccess } from '@/authentication/decorators/PublicAccess.decorator'
import { ClerkWebhookService } from '../services/clerk-webhook.service'
import { ClerkWebhookPayload } from './clerk-webhook.types'

if (!process.env.CLERK_WEBHOOK_SECRET) {
  throw new Error('CLERK_WEBHOOK_SECRET is required for application startup')
}

const CLERK_WEBHOOK_SECRET: string = process.env.CLERK_WEBHOOK_SECRET

@Controller('webhooks')
export class ClerkWebhookController {
  constructor(
    private readonly clerkWebhookService: ClerkWebhookService,
    private readonly eventEmitter: EventEmitter2,
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
      const wh = new Webhook(CLERK_WEBHOOK_SECRET)
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
      case 'user.updated':
        await this.clerkWebhookService.handleUserUpdated(event.data)
        this.eventEmitter.emit('clerk.user.updated', event.data)
        break
      case 'user.deleted':
        await this.clerkWebhookService.handleUserDeleted(event.data)
        this.eventEmitter.emit('clerk.user.deleted', event.data)
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
