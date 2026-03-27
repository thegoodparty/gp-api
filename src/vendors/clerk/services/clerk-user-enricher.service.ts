import { Inject, Injectable } from '@nestjs/common'
import { ClerkClient } from '@clerk/backend'
import { PinoLogger } from 'nestjs-pino'
import { CLERK_CLIENT_PROVIDER_TOKEN } from '@/vendors/clerk/providers/clerk-client.provider'

export interface ClerkUserFields {
  email: string
  firstName: string
  lastName: string
}

type Enrichable = {
  clerkId: string | null
  email?: string | null
  firstName?: string | null
  lastName?: string | null
}

@Injectable()
export class ClerkUserEnricherService {
  constructor(
    @Inject(CLERK_CLIENT_PROVIDER_TOKEN)
    private readonly clerkClient: ClerkClient,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ClerkUserEnricherService.name)
  }

  async fetchClerkFields(clerkId: string): Promise<ClerkUserFields | null> {
    try {
      const clerkUser = await this.clerkClient.users.getUser(clerkId)
      const email =
        clerkUser.primaryEmailAddress?.emailAddress ??
        clerkUser.emailAddresses?.[0]?.emailAddress

      return {
        email: email ?? '',
        firstName: clerkUser.firstName ?? '',
        lastName: clerkUser.lastName ?? '',
      }
    } catch (err) {
      this.logger.warn(
        { err, clerkId },
        'Failed to fetch user fields from Clerk',
      )
      return null
    }
  }

  async enrichUser<T extends Enrichable>(user: T): Promise<T> {
    if (!user.clerkId) return user

    const fields = await this.fetchClerkFields(user.clerkId)
    if (!fields) return user

    return this.applyFields(user, fields)
  }

  async enrichUsers<T extends Enrichable>(users: T[]): Promise<T[]> {
    const clerkIds = users
      .map((u) => u.clerkId)
      .filter((id): id is string => id != null)

    if (clerkIds.length === 0) return users

    const fieldsByClerkId = await this.fetchClerkFieldsBulk(clerkIds)

    return users.map((user) => {
      if (!user.clerkId) return user
      const fields = fieldsByClerkId.get(user.clerkId)
      return fields ? this.applyFields(user, fields) : user
    })
  }

  private async fetchClerkFieldsBulk(
    clerkIds: string[],
  ): Promise<Map<string, ClerkUserFields>> {
    const result = new Map<string, ClerkUserFields>()

    try {
      const clerkUsers = await this.clerkClient.users.getUserList({
        userId: clerkIds,
        limit: clerkIds.length,
      })

      for (const clerkUser of clerkUsers.data) {
        const email =
          clerkUser.primaryEmailAddress?.emailAddress ??
          clerkUser.emailAddresses?.[0]?.emailAddress

        result.set(clerkUser.id, {
          email: email ?? '',
          firstName: clerkUser.firstName ?? '',
          lastName: clerkUser.lastName ?? '',
        })
      }
    } catch (err) {
      this.logger.warn(
        { err, count: clerkIds.length },
        'Failed to bulk fetch user fields from Clerk',
      )
    }

    return result
  }

  private applyFields<T extends Enrichable>(
    user: T,
    fields: ClerkUserFields,
  ): T {
    return {
      ...user,
      ...('email' in user ? { email: fields.email } : {}),
      ...('firstName' in user ? { firstName: fields.firstName } : {}),
      ...('lastName' in user ? { lastName: fields.lastName } : {}),
    }
  }
}
