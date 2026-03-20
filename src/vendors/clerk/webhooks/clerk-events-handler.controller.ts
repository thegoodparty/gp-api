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
import { z } from 'zod'
import { PublicAccess } from '@/authentication/decorators/PublicAccess.decorator'
import {
  AUTH_USER_DELETED_EVENT,
  AUTH_USER_UPDATED_EVENT,
  AuthUserEventData,
} from '@/authentication/interfaces/auth-provider.interface'
import { ClerkEventsHandlerService } from '@/vendors/clerk/services/clerk-events-handler.service'
import {
  CLERK_EVENT_USER_DELETED,
  CLERK_EVENT_USER_UPDATED,
  ClerkEventsHandlerPayload,
} from '@/vendors/clerk/webhooks/clerk-events-handler.types'

const clerkEventSchema = z.object({
  type: z.string(),
  data: z.object({
    id: z.string(),
    email_addresses: z
      .array(
        z.object({
          email_address: z.string(),
          id: z.string(),
        }),
      )
      .optional(),
    primary_email_address_id: z.string().nullable().optional(),
    first_name: z.string().nullable().optional(),
    last_name: z.string().nullable().optional(),
    image_url: z.string().nullable().optional(),
  }),
})

if (!process.env.CLERK_WEBHOOK_SECRET) {
  throw new Error('CLERK_WEBHOOK_SECRET is required for application startup')
}

const CLERK_WEBHOOK_SECRET: string = process.env.CLERK_WEBHOOK_SECRET

@Controller('webhooks')
export class ClerkEventsHandlerController {
  constructor(
    private readonly clerkEventsHandlerService: ClerkEventsHandlerService,
    private readonly eventEmitter: EventEmitter2,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ClerkEventsHandlerController.name)
  }

  @Post('clerk')
  @PublicAccess()
  @HttpCode(HttpStatus.OK)
  async handleClerkEvent(
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

    let verified: unknown
    try {
      const wh = new Webhook(CLERK_WEBHOOK_SECRET)
      verified = wh.verify(rawBody.toString('utf-8'), {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': svixSignature,
      })
    } catch (err) {
      this.logger.warn({ err }, 'Failed to verify Clerk webhook signature')
      throw new UnauthorizedException('Invalid webhook signature')
    }

    const parsed = clerkEventSchema.safeParse(verified)
    if (!parsed.success) {
      this.logger.warn(
        { errors: parsed.error.errors },
        'Invalid Clerk webhook payload',
      )
      throw new BadRequestException('Invalid webhook payload')
    }

    const event: ClerkEventsHandlerPayload = parsed.data

    this.logger.info(
      { eventType: event.type },
      'Processing Clerk webhook event',
    )

    const authEvent: AuthUserEventData = {
      externalUserId: event.data.id,
    }

    switch (event.type) {
      case CLERK_EVENT_USER_UPDATED:
        await this.clerkEventsHandlerService.handleUserUpdated(event.data)
        this.eventEmitter.emit(AUTH_USER_UPDATED_EVENT, authEvent)
        break
      case CLERK_EVENT_USER_DELETED:
        await this.clerkEventsHandlerService.handleUserDeleted(event.data)
        this.eventEmitter.emit(AUTH_USER_DELETED_EVENT, authEvent)
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
