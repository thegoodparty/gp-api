import { Injectable } from '@nestjs/common'
import { PinoLogger } from 'nestjs-pino'
import { UsersService } from '@/users/services/users.service'
import { ClerkEventsHandlerEventData } from '@/vendors/clerk/webhooks/clerk-events-handler.types'

function getPrimaryEmail(
  data: ClerkEventsHandlerEventData,
): string | undefined {
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
export class ClerkEventsHandlerService {
  constructor(
    private readonly usersService: UsersService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ClerkEventsHandlerService.name)
  }

  async handleUserUpdated(data: ClerkEventsHandlerEventData) {
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

    const updates: Record<string, string | null> = {}
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

    const avatar = data.image_url ?? null
    if (avatar !== user.avatar) {
      updates.avatar = avatar
    }

    if (Object.keys(updates).length === 0) return

    await this.usersService.updateUser({ id: user.id }, updates)
    this.logger.info(
      { userId: user.id, clerkId: data.id },
      'Updated user from Clerk',
    )
  }

  async handleUserDeleted(data: Pick<ClerkEventsHandlerEventData, 'id'>) {
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

    try {
      await this.usersService.deleteUser(user.id)
      this.logger.info(
        { userId: user.id, clerkId: data.id },
        'Deleted user and cancelled subscriptions via Clerk webhook',
      )
    } catch (error) {
      this.logger.error(
        { userId: user.id, clerkId: data.id, error },
        'Failed to delete user via Clerk webhook',
      )
      throw error
    }
  }
}
