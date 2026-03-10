import { forwardRef, Inject, Injectable } from '@nestjs/common'
import { PinoLogger } from 'nestjs-pino'
import { UsersService } from '@/users/services/users.service'
import { ClerkWebhookEventData } from '../webhooks/clerk-webhook.types'

function getPrimaryEmail(data: ClerkWebhookEventData): string | undefined {
  const addresses = data.email_addresses
  if (!addresses?.length) return undefined
  if (data.primary_email_address_id) {
    const primary = addresses.find(
      (e) => e.id === data.primary_email_address_id,
    )
    if (primary) return primary.email_address
  }
  return addresses[0].email_address
}

@Injectable()
export class ClerkWebhookService {
  constructor(
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ClerkWebhookService.name)
  }

  async handleUserCreated(data: ClerkWebhookEventData) {
    const email = getPrimaryEmail(data)
    if (!email) {
      this.logger.warn(
        { clerkId: data.id },
        'Clerk user.created event missing email address',
      )
      return
    }

    const existingByClerkId = await this.usersService.findUser({
      clerkId: data.id,
    })
    if (existingByClerkId) {
      this.logger.info(
        { clerkId: data.id },
        'User already exists with this clerkId, skipping',
      )
      return
    }

    const existingByEmail = await this.usersService.findUserByEmail(email)
    if (existingByEmail) {
      this.logger.info(
        { userId: existingByEmail.id, clerkId: data.id },
        'Linking existing user to Clerk account',
      )
      await this.usersService.updateUser(
        { id: existingByEmail.id },
        { clerkId: data.id },
      )
      return
    }

    const firstName = data.first_name ?? ''
    const lastName = data.last_name ?? ''
    const user = await this.usersService.createUserFromClerk({
      clerkId: data.id,
      email,
      firstName,
      lastName,
    })
    this.logger.info(
      { userId: user.id, clerkId: data.id },
      'Created new user from Clerk',
    )
  }

  async handleUserUpdated(data: ClerkWebhookEventData) {
    const user = await this.usersService.findUser({ clerkId: data.id })
    if (!user) {
      this.logger.warn(
        { clerkId: data.id },
        'Clerk user.updated event for unknown user',
      )
      return
    }

    const email = getPrimaryEmail(data)

    const firstNameChanged = data.first_name !== undefined
    const lastNameChanged = data.last_name !== undefined

    const updates: Record<string, string> = {}
    if (email) updates.email = email
    if (firstNameChanged) updates.firstName = data.first_name ?? ''
    if (lastNameChanged) updates.lastName = data.last_name ?? ''

    if (firstNameChanged || lastNameChanged) {
      const first = firstNameChanged
        ? (data.first_name ?? '')
        : (user.firstName ?? '')
      const last = lastNameChanged
        ? (data.last_name ?? '')
        : (user.lastName ?? '')
      updates.name = `${first} ${last}`.trim()
    }

    await this.usersService.updateUser({ id: user.id }, updates)
    this.logger.info(
      { userId: user.id, clerkId: data.id },
      'Updated user from Clerk',
    )
  }

  async handleUserDeleted(data: Pick<ClerkWebhookEventData, 'id'>) {
    const user = await this.usersService.findUser({ clerkId: data.id })
    if (!user) {
      this.logger.warn(
        { clerkId: data.id },
        'Clerk user.deleted event for unknown user',
      )
      return
    }

    await this.usersService.updateUser({ id: user.id }, { clerkId: null })
    this.logger.info(
      { userId: user.id, clerkId: data.id },
      'Cleared clerkId from user (soft delete)',
    )
  }
}
