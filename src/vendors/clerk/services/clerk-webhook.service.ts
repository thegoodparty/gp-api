import { forwardRef, Inject, Injectable } from '@nestjs/common'
import { PinoLogger } from 'nestjs-pino'
import { UsersService } from '@/users/services/users.service'
import { ClerkWebhookEventData } from '@/vendors/clerk/webhooks/clerk-webhook.types'

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

    await this.usersService.updateUser(
      { id: user.id },
      {
        clerkId: null,
        metaData: { ...((user.metaData as object) ?? {}), isDeleted: true },
      },
    )
    this.logger.info(
      { userId: user.id, clerkId: data.id },
      'Cleared clerkId and marked user as deleted (soft delete)',
    )
  }
}
