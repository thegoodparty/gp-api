import { Injectable } from '@nestjs/common'
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
    private readonly usersService: UsersService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ClerkWebhookService.name)
  }

  async handleUserUpdated(data: ClerkWebhookEventData) {
    const user = await this.usersService.findUser({
      clerkId: data.id,
    })
    if (!user) {
      this.logger.warn(
        { clerkId: data.id },
        'Clerk user.updated event for unknown user',
      )
      return
    }

    const email = getPrimaryEmail(data)
    const firstName = data.first_name ?? user.firstName ?? ''
    const lastName = data.last_name ?? user.lastName ?? ''

    const updates: Record<string, string> = {}
    if (email && email !== user.email) updates.email = email
    if (firstName !== user.firstName) {
      updates.firstName = firstName
    }
    if (lastName !== user.lastName) {
      updates.lastName = lastName
    }

    if (updates.firstName !== undefined || updates.lastName !== undefined) {
      updates.name = `${firstName} ${lastName}`.trim()
    }

    if (Object.keys(updates).length === 0) return

    await this.usersService.updateUser({ id: user.id }, updates)
    this.logger.info(
      { userId: user.id, clerkId: data.id },
      'Updated user from Clerk',
    )
  }

  async handleUserDeleted(data: Pick<ClerkWebhookEventData, 'id'>) {
    const user = await this.usersService.findUser({
      clerkId: data.id,
    })
    if (!user) {
      this.logger.warn(
        { clerkId: data.id },
        'Clerk user.deleted event for unknown user',
      )
      return
    }

    const existingMeta =
      typeof user.metaData === 'object' &&
      user.metaData !== null &&
      !Array.isArray(user.metaData)
        ? user.metaData
        : {}

    await this.usersService.updateUser(
      { id: user.id },
      {
        clerkId: null,
        metaData: { ...existingMeta, isDeleted: true },
      },
    )
    this.logger.info(
      { userId: user.id, clerkId: data.id },
      'Cleared clerkId and marked as deleted (soft delete)',
    )
  }
}
