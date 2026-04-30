import { Inject, Injectable } from '@nestjs/common'
import { ClerkClient } from '@clerk/backend'
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'
import { PinoLogger } from 'nestjs-pino'
import { PrismaService } from '@/prisma/prisma.service'
import { CLERK_CLIENT_PROVIDER_TOKEN } from '@/vendors/clerk/providers/clerk-client.provider'
import { clerkThrottle } from '@/vendors/clerk/util/clerkThrottle.util'

export interface ClerkUserFields {
  email: string | null
  firstName: string | null
  lastName: string | null
  name: string | null
  avatar: string | null
}

type Enrichable = {
  id?: number
  clerkId: string | null
  email?: string | null
  firstName?: string | null
  lastName?: string | null
  name?: string | null
  avatar?: string | null
}

@Injectable()
export class ClerkUserEnricherService {
  constructor(
    @Inject(CLERK_CLIENT_PROVIDER_TOKEN)
    private readonly clerkClient: ClerkClient,
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ClerkUserEnricherService.name)
  }

  private readonly fieldsCache = new Map<
    string,
    { fields: ClerkUserFields; expiresAt: number }
  >()

  /** Negative cache for lazy email→Clerk lookups (same TTL as Clerk field cache). */
  private readonly emailMissCache = new Map<string, number>()

  private readonly cacheTtlMs = 30_000

  async fetchClerkFields(clerkId: string): Promise<ClerkUserFields | null> {
    const cached = this.fieldsCache.get(clerkId)
    if (cached && cached.expiresAt > Date.now()) {
      return cached.fields
    }

    try {
      const clerkUser = await this.clerkClient.users.getUser(clerkId)
      const fields = this.buildFields(clerkUser)

      this.fieldsCache.set(clerkId, {
        fields,
        expiresAt: Date.now() + this.cacheTtlMs,
      })

      return fields
    } catch (err) {
      this.logger.warn(
        { err, clerkId },
        'Failed to fetch user fields from Clerk',
      )
      return null
    }
  }

  async enrichUser<T extends Enrichable>(user: T): Promise<T> {
    let effective = { ...user } as T

    if (!effective.clerkId) {
      const linkedId = await this.tryResolveAndPersistClerkId(effective)
      if (linkedId) {
        effective = { ...effective, clerkId: linkedId }
      } else {
        return this.stripStaleAvatarWhenNoClerk(effective)
      }
    }

    const clerkIdForFetch = effective.clerkId
    if (!clerkIdForFetch) {
      return this.stripStaleAvatarWhenNoClerk(effective)
    }

    const fields = await this.fetchClerkFields(clerkIdForFetch)
    if (!fields) {
      return this.stripAvatarOnClerkFetchFailure(effective)
    }

    return this.applyFields(effective, fields)
  }

  async enrichUsers<T extends Enrichable>(users: T[]): Promise<T[]> {
    const clerkIds = users
      .map((u) => u.clerkId)
      .filter((id): id is string => id != null)

    if (clerkIds.length === 0) {
      return users.map((u) => this.stripStaleAvatarWhenNoClerk(u))
    }

    const fieldsByClerkId = await this.fetchClerkFieldsBulk(clerkIds)

    return users.map((user) => {
      if (!user.clerkId) {
        return this.stripStaleAvatarWhenNoClerk(user)
      }
      const fields = fieldsByClerkId.get(user.clerkId)
      if (!fields) {
        return this.stripAvatarOnClerkFetchFailure(user)
      }
      return this.applyFields(user, fields)
    })
  }

  private async fetchClerkFieldsBulk(
    clerkIds: string[],
  ): Promise<Map<string, ClerkUserFields>> {
    const result = new Map<string, ClerkUserFields>()
    const now = Date.now()
    const uncachedIds: string[] = []

    for (const id of clerkIds) {
      const cached = this.fieldsCache.get(id)
      if (cached && cached.expiresAt > now) {
        result.set(id, cached.fields)
      } else {
        uncachedIds.push(id)
      }
    }

    if (uncachedIds.length === 0) return result

    try {
      const clerkUsers = await this.clerkClient.users.getUserList({
        userId: uncachedIds,
        limit: uncachedIds.length,
      })

      for (const clerkUser of clerkUsers.data) {
        const fields = this.buildFields(clerkUser)

        result.set(clerkUser.id, fields)
        this.fieldsCache.set(clerkUser.id, {
          fields,
          expiresAt: now + this.cacheTtlMs,
        })
      }
    } catch (err) {
      this.logger.warn(
        { err, count: uncachedIds.length },
        'Failed to bulk fetch user fields from Clerk',
      )
    }

    return result
  }

  private applyFields<T extends Enrichable>(
    user: T,
    fields: ClerkUserFields,
  ): T {
    // Only overwrite identity fields when Clerk has a non-empty value.
    // Avatar always follows Clerk (including null when hasImage is false).
    return {
      ...user,
      ...('email' in user && fields.email ? { email: fields.email } : {}),
      ...('firstName' in user && fields.firstName
        ? { firstName: fields.firstName }
        : {}),
      ...('lastName' in user && fields.lastName
        ? { lastName: fields.lastName }
        : {}),
      ...('name' in user && fields.name ? { name: fields.name } : {}),
      ...('avatar' in user ? { avatar: fields.avatar } : {}),
    }
  }

  private buildFields(clerkUser: {
    primaryEmailAddress?: { emailAddress: string } | null
    emailAddresses?: { emailAddress: string }[]
    firstName: string | null
    lastName: string | null
    fullName: string | null
    hasImage: boolean
    imageUrl: string
  }): ClerkUserFields {
    const email =
      clerkUser.primaryEmailAddress?.emailAddress ??
      clerkUser.emailAddresses?.[0]?.emailAddress ??
      null

    const firstName = clerkUser.firstName ?? null
    const lastName = clerkUser.lastName ?? null
    const fallbackName = [firstName, lastName].filter(Boolean).join(' ').trim()
    const name =
      clerkUser.fullName ?? (fallbackName.length > 0 ? fallbackName : null)

    return {
      email,
      firstName,
      lastName,
      name,
      avatar: clerkUser.hasImage ? clerkUser.imageUrl : null,
    }
  }

  /** No Clerk id (or lazy link failed): never expose legacy DB avatar as “truth”. */
  private stripStaleAvatarWhenNoClerk<T extends Enrichable>(user: T): T {
    if (!('avatar' in user)) return user
    return { ...user, avatar: null }
  }

  /** Clerk id present but API fetch failed: keep DB name/email, drop stale avatar. */
  private stripAvatarOnClerkFetchFailure<T extends Enrichable>(user: T): T {
    if (!('avatar' in user)) return user
    return { ...user, avatar: null }
  }

  private async tryResolveAndPersistClerkId<T extends Enrichable>(
    user: T,
  ): Promise<string | null> {
    const id = typeof user.id === 'number' ? user.id : null
    const email =
      typeof user.email === 'string' && user.email.trim().length > 0
        ? user.email.trim()
        : null
    if (!id || !email) return null

    const key = email.toLowerCase()
    const missUntil = this.emailMissCache.get(key)
    if (missUntil != null && missUntil > Date.now()) return null

    try {
      const { data } = await clerkThrottle(() =>
        this.clerkClient.users.getUserList({
          emailAddress: [email],
          limit: 1,
        }),
      )
      const clerkUser = data[0]
      if (!clerkUser?.id) {
        this.emailMissCache.set(key, Date.now() + this.cacheTtlMs)
        return null
      }

      await this.prisma.user.update({
        where: { id },
        data: { clerkId: clerkUser.id },
      })
      return clerkUser.id
    } catch (err) {
      if (
        err instanceof PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        this.logger.warn(
          { email, userId: id },
          'Lazy Clerk link skipped: clerkId already taken',
        )
      } else {
        this.logger.warn(
          { err, email, userId: id },
          'Lazy Clerk link by email failed',
        )
      }
      this.emailMissCache.set(key, Date.now() + this.cacheTtlMs)
      return null
    }
  }
}
