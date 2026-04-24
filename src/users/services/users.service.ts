import {
  DEFAULT_PAGINATION_LIMIT,
  DEFAULT_PAGINATION_OFFSET,
  DEFAULT_SORT_BY,
  DEFAULT_SORT_ORDER,
} from '@/shared/constants/paginationOptions.consts'
import { CLERK_CLIENT_PROVIDER_TOKEN } from '@/vendors/clerk/providers/clerk-client.provider'
import { ClerkUserEnricherService } from '@/vendors/clerk/services/clerk-user-enricher.service'
import { EVENTS } from '@/vendors/segment/segment.types'
import { ClerkClient } from '@clerk/backend'
import { type ListUsersPagination } from '@goodparty_org/contracts'
import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
} from '@nestjs/common'
import { Interval } from '@nestjs/schedule'
import { Campaign, Prisma, User } from '@prisma/client'
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'
import { subHours } from 'date-fns'
import ms from 'ms'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import {
  PaginatedResults,
  WithOptional,
  WrapperType,
} from 'src/shared/types/utility.types'
import Stripe from 'stripe'
import { AnalyticsService } from '../../analytics/analytics.service'
import { trimMany } from '../../shared/util/strings.util'
import { StripeService } from '../../vendors/stripe/services/stripe.service'
import {
  CreateUserInputDto,
  SIGN_UP_MODE,
} from '../schemas/CreateUserInput.schema'
import { hashPassword } from '../util/passwords.util'
import { CrmUsersService } from './crmUsers.service'
import { clerkThrottle } from 'seed/util/clerkThrottle.util'

const REGISTER_USER_CRM_FORM_ID = '37d98f01-7062-405f-b0d1-c95179057db1'

const TEST_USER_DOMAIN = '@test.goodparty.org'

@Injectable()
export class UsersService extends createPrismaBase(MODELS.User) {
  constructor(
    @Inject(forwardRef(() => AnalyticsService))
    private readonly analytics: WrapperType<AnalyticsService>,
    @Inject(forwardRef(() => CrmUsersService))
    private readonly crm: WrapperType<CrmUsersService>,
    @Inject(forwardRef(() => StripeService))
    private readonly stripeService: WrapperType<StripeService>,
    @Inject(forwardRef(() => ClerkUserEnricherService))
    private readonly clerkEnricher: WrapperType<ClerkUserEnricherService>,
    @Inject(CLERK_CLIENT_PROVIDER_TOKEN)
    private readonly clerkClient: ClerkClient,
  ) {
    super()
  }

  override onModuleInit() {
    super.onModuleInit()
    this.wrapReadsWithEnrichment()
  }

  findUser(where: Prisma.UserWhereUniqueInput) {
    return this.findUnique({
      where,
    })
  }

  findUserByEmail(email: string) {
    return this.findFirst({
      where: { email: { equals: email, mode: Prisma.QueryMode.insensitive } },
    })
  }

  async findByCampaign(campaign: Campaign) {
    return this.findUser({ id: campaign.userId })
  }

  async findByCustomerId(customerId: string) {
    return this.findFirst({
      where: {
        metaData: {
          path: ['customerId'],
          equals: customerId,
        },
      },
    })
  }

  findUserByResetToken(email: string, token: string) {
    return this.findFirstOrThrow({
      where: {
        email: { equals: email, mode: Prisma.QueryMode.insensitive },
        passwordResetToken: token,
      },
    })
  }

  async updatePassword(
    userId: number,
    password: string,
    clearResetToken?: boolean,
  ) {
    return this.model.update({
      where: { id: userId },
      data: {
        // hash password
        password: await hashPassword(password),
        // clear reset token
        passwordResetToken: clearResetToken ? null : undefined,
      },
    })
  }

  setResetToken(userId: number, passwordResetToken: string) {
    return this.model.update({
      where: { id: userId },
      data: {
        passwordResetToken,
      },
    })
  }

  async createUser(
    userData: WithOptional<CreateUserInputDto, 'password' | 'phone'>,
  ): Promise<User> {
    const { signUpMode, allowTexts, ...restUserData } = userData
    const {
      password,
      firstName,
      lastName,
      zip,
      phone,
      name,
      email: unNormalizedEmail,
    } = restUserData
    const email = unNormalizedEmail

    const hashedPassword = password ? await hashPassword(password) : null
    const existingUser = await this.findUser({ email })
    if (existingUser) {
      throw new ConflictException('User with this email already exists')
    }

    const {
      firstName: firstNameTrimmed,
      lastName: lastNameTrimmed,
      ...trimmed
    } = trimMany({
      firstName,
      lastName,
      ...(phone ? { phone } : {}),
      ...(zip ? { zip } : {}),
    })

    const metaData = {
      textNotifications: allowTexts,
    }

    const userDataToPersist = {
      ...restUserData,
      ...trimmed,
      ...(hashedPassword ? { password: hashedPassword } : {}),
      hasPassword: !!hashedPassword,
      name: name?.trim() || `${firstNameTrimmed} ${lastNameTrimmed}`,
      metaData,
    }

    const user = await this.model.create({
      data: userDataToPersist,
    })

    // We have to await this form post to ensure the user is created in CRM
    //  before we try to update the crm contact with the user id
    await this.crm.submitCrmForm(
      REGISTER_USER_CRM_FORM_ID,
      [
        { name: 'firstName', value: firstName, objectTypeId: '0-1' },
        { name: 'lastName', value: lastName, objectTypeId: '0-1' },
        { name: 'email', value: email, objectTypeId: '0-1' },
        ...(phone
          ? [{ name: 'phone', value: phone, objectTypeId: '0-1' }]
          : []),
        ...(signUpMode
          ? [
              {
                name: 'facilitated_signup',
                value:
                  signUpMode === SIGN_UP_MODE.FACILITATED ? 'true' : 'false',
              },
            ]
          : []),
      ],
      'registerPage',
      'https://goodparty.org/sign-up',
    )

    await this.crm.trackUserUpdate(user.id)

    return user
  }

  async findOrProvisionByClerk(data: {
    clerkId: string
    email: string
    firstName: string
    lastName: string
  }): Promise<User | null> {
    const existingByClerkId = await this.findUser({ clerkId: data.clerkId })
    if (existingByClerkId) return existingByClerkId

    const existingByEmail = await this.findUserByEmail(data.email)
    if (existingByEmail) {
      this.logger.info(
        { userId: existingByEmail.id, clerkId: data.clerkId },
        'Linking existing user to Clerk account',
      )
      return this.updateUser(
        { id: existingByEmail.id },
        { clerkId: data.clerkId },
      )
    }

    try {
      const user = await this.model.create({
        data: {
          clerkId: data.clerkId,
          email: data.email,
          firstName: data.firstName,
          lastName: data.lastName,
          name: `${data.firstName} ${data.lastName}`.trim(),
        },
      })
      this.logger.info(
        { userId: user.id, clerkId: data.clerkId },
        'Created new user from Clerk',
      )
      return user
    } catch (err) {
      if (
        err instanceof PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        this.logger.debug(
          { clerkId: data.clerkId },
          'Concurrent provisioning detected, fetching existing user',
        )
        const existing =
          (await this.findUser({ clerkId: data.clerkId })) ??
          (await this.findUserByEmail(data.email))
        if (!existing) {
          this.logger.error(
            { clerkId: data.clerkId, email: data.email },
            'P2002 race but user not found by clerkId or email',
          )
        }
        return existing
      }
      throw err
    }
  }

  async updateUser(where: Prisma.UserWhereUniqueInput, data: Partial<User>) {
    return this.optimisticLockingUpdate({ where }, (existing) => {
      const { metaData: incomingMetaData, ...fields } = data
      if (incomingMetaData === undefined) {
        return fields
      }
      return {
        ...fields,
        metaData: {
          ...(existing.metaData ?? {}),
          ...(incomingMetaData ?? {}),
        },
      }
    })
  }

  async patchUserMetaData(
    userId: number,
    newMetaData: PrismaJson.UserMetaData,
  ) {
    const updatedUser = await this.optimisticLockingUpdate(
      { where: { id: userId } },
      (user) => {
        this.logger.info(
          { data: user.metaData ?? {} },
          `User ${user.id} metadata pre-update: `,
        )
        return {
          metaData: { ...(user.metaData ?? {}), ...(newMetaData ?? {}) },
        }
      },
    )
    this.logger.info(
      { data: updatedUser.metaData ?? {} },
      `User ${updatedUser.id} metadata post-update: `,
    )

    return updatedUser
  }

  async deleteUser(id: number, initiatedByUserId: number) {
    const user = await this.model.findUnique({
      where: { id },
      include: { campaigns: true },
    })

    const campaign = user?.campaigns?.[0]
    // Prisma JSON column typed as JsonValue — requires prisma-json-types-generator to narrow
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const subscriptionId = (campaign?.details as { subscriptionId?: string })
      ?.subscriptionId

    await this.client.$transaction(async (tx) => {
      await tx.user.delete({ where: { id } })
      this.logger.info({ userId: id }, 'User deleted from database')

      if (user?.clerkId) {
        try {
          await this.clerkClient.users.deleteUser(user.clerkId)
          this.logger.info(
            { userId: id, clerkId: user.clerkId },
            'User deleted from Clerk',
          )
        } catch (error) {
          this.logger.error(
            { error },
            `Failed to delete Clerk user ${user.clerkId} during account deletion`,
          )
          throw new BadGatewayException(
            `Failed to delete Clerk user during account deletion`,
          )
        }
      }
    })

    if (subscriptionId) {
      try {
        await this.stripeService.cancelSubscription(subscriptionId)
      } catch (error) {
        if (
          error instanceof BadGatewayException &&
          error.cause instanceof Stripe.errors.StripeError
        ) {
          const stripeError = error.cause
          this.logger.error(
            {
              data: {
                code: stripeError.code,
                type: stripeError.type,
                statusCode: stripeError.statusCode,
              },
            },
            `Failed to cancel subscription ${subscriptionId} after user deletion: ${stripeError.message}`,
          )
        } else {
          this.logger.error(
            { error },
            `Unexpected error canceling subscription ${subscriptionId} after user deletion`,
          )
        }
      }
    }

    await this.trackUserDeletion(id, initiatedByUserId, user)
  }

  private async trackUserDeletion(
    id: number,
    initiatedByUserId: number,
    user: Prisma.UserGetPayload<{ include: { campaigns: true } }> | null,
  ) {
    const isSelf = initiatedByUserId === id
    // Prisma JSON column typed as JsonValue — requires prisma-json-types-generator to narrow
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const metaData = user?.metaData as PrismaJson.UserMetaData | null
    const userContext = {
      email: user?.email,
      hubspotId: metaData?.hubspotId as string | undefined,
    }
    const trackingEvent = EVENTS.Account.UserDeleted
    const trackingProperties = {
      clerkId: user?.clerkId,
      hadActiveCampaign: (user?.campaigns?.length ?? 0) > 0,
      initiatedBy: isSelf ? 'self' : 'admin',
      ...(!isSelf && { initiatedByUserId }),
    }

    try {
      await this.analytics.track(
        id,
        trackingEvent,
        trackingProperties,
        userContext,
      )
    } catch (error) {
      this.logger.error(
        { error, trackingEvent, trackingProperties },
        'Failed to track user deletion event',
      )
    }
  }

  async impersonateUser(userId: number, actorClerkId: string) {
    const user = await this.findUser({ id: userId })
    if (!user?.clerkId) {
      throw new BadRequestException('User does not have an associated Clerk ID')
    }
    try {
      const { token } = await this.clerkClient.actorTokens.create({
        userId: user.clerkId,
        actor: { sub: actorClerkId },
        expiresInSeconds: 3600,
      })
      if (!token) {
        throw new BadGatewayException('Clerk did not return an actor token')
      }
      return { token }
    } catch (err) {
      this.logger.error(
        {
          err,
          userId,
          targetClerkId: user.clerkId,
          actorClerkId,
          clerkStatus:
            err instanceof Error
              ? (err as Error & { status?: unknown }).status
              : undefined,
          clerkErrors:
            err instanceof Error
              ? (err as Error & { errors?: unknown }).errors
              : undefined,
          clerkMessage: err instanceof Error ? err.message : String(err),
        },
        'Failed to create Clerk impersonation token',
      )
      throw new BadGatewayException('Failed to create impersonation token')
    }
  }

  async flushLastVisited(
    userId: number,
    pendingLastVisitedMs: number,
    sessionTimeoutMs: number,
  ) {
    // Update lastVisited to the max of existing and pending; increment sessionCount if a new session
    return this.client.$executeRaw`
      UPDATE "user" u
      SET
        meta_data = jsonb_set(
          jsonb_set(
            COALESCE(u.meta_data, '{}'::jsonb),
            '{lastVisited}',
            to_jsonb(GREATEST(
              COALESCE((u.meta_data->>'lastVisited')::bigint, 0),
              ${pendingLastVisitedMs}::bigint
            )),
            true
          ),
          '{sessionCount}',
          to_jsonb(
            CASE
              WHEN COALESCE((u.meta_data->>'lastVisited')::bigint, 0) + ${sessionTimeoutMs}::bigint < ${pendingLastVisitedMs}::bigint
                THEN COALESCE((u.meta_data->>'sessionCount')::bigint, 0) + 1
              ELSE COALESCE((u.meta_data->>'sessionCount')::bigint, 0)
            END
          ),
          true
        ),
        updated_at = NOW()
      WHERE u.id = ${userId}
    `
  }

  async listUsers({
    offset: skip = DEFAULT_PAGINATION_OFFSET,
    limit = DEFAULT_PAGINATION_LIMIT,
    sortBy = DEFAULT_SORT_BY,
    sortOrder = DEFAULT_SORT_ORDER,
    firstName,
    lastName,
    email,
  }: ListUsersPagination): Promise<PaginatedResults<User>> {
    const where: Prisma.UserWhereInput = {
      ...(firstName
        ? {
            firstName: {
              contains: firstName,
              mode: Prisma.QueryMode.insensitive,
            },
          }
        : {}),
      ...(lastName
        ? {
            lastName: {
              contains: lastName,
              mode: Prisma.QueryMode.insensitive,
            },
          }
        : {}),
      ...(email
        ? { email: { contains: email, mode: Prisma.QueryMode.insensitive } }
        : {}),
    }

    const data = await this.model.findMany({
      skip,
      take: limit,
      orderBy: { [sortBy]: sortOrder },
      where,
    })

    return {
      data: await this.clerkEnricher.enrichUsers(data),
      meta: {
        total: await this.model.count({ where }),
        offset: skip,
        limit,
      },
    }
  }

  /**
   * Regularly deletes old e2e test users that were created more than 3 hours
   * ago. Cleans out users from both the postgres db and from Clerk.
   */
  @Interval(ms('6h'))
  async deleteTestUsers() {
    try {
      const cutoff = subHours(new Date(), 3)

      // 1. Delete DB users.
      const dbUsers = await this.model.findMany({
        where: {
          email: { endsWith: TEST_USER_DOMAIN },
          createdAt: { lt: cutoff },
        },
        select: { id: true, email: true },
      })

      for (const dbUser of dbUsers) {
        try {
          await this.model.delete({ where: { id: dbUser.id } })
          this.logger.info({ userId: dbUser.id }, 'Deleted DB test user')
        } catch (err) {
          this.logger.error(
            { err, userId: dbUser.id },
            'Failed to delete DB test user, skipping',
          )
        }
      }

      // 2. Delete Clerk users.
      // For now, don't worry about paginating. This 500 limit will always
      // catch up at our current pace of test user creation.
      const { data: clerkUsers } = await clerkThrottle(() =>
        this.clerkClient.users.getUserList({
          limit: 500,
          query: TEST_USER_DOMAIN,
        }),
      )

      const clerkUsersToDelete = clerkUsers
        .filter((user) =>
          user.emailAddresses.some((e) =>
            e.emailAddress.endsWith(TEST_USER_DOMAIN),
          ),
        )
        .filter((user) => user.createdAt < cutoff.getTime())

      for (const clerkUser of clerkUsersToDelete) {
        try {
          await clerkThrottle(() =>
            this.clerkClient.users.deleteUser(clerkUser.id),
          )
          this.logger.info({ userId: clerkUser.id }, 'Deleted Clerk test user')
        } catch (err) {
          this.logger.error(
            { err, userId: clerkUser.id },
            'Failed to delete Clerk test user, skipping',
          )
        }
      }

      this.logger.info('Test user cleanup pass complete')
    } catch (err) {
      this.logger.error({ err }, 'Failed to delete test users')
    }
  }

  private wrapReadsWithEnrichment() {
    const enricher = this.clerkEnricher

    Object.defineProperty(this, 'findUnique', {
      value: async (args: Prisma.UserFindUniqueArgs) => {
        const result = await this.model.findUnique(args)
        return result ? enricher.enrichUser(result) : result
      },
      writable: true,
      configurable: true,
    })

    Object.defineProperty(this, 'findUniqueOrThrow', {
      value: async (args: Prisma.UserFindUniqueOrThrowArgs) => {
        const result = await this.model.findUniqueOrThrow(args)
        return enricher.enrichUser(result)
      },
      writable: true,
      configurable: true,
    })

    Object.defineProperty(this, 'findFirst', {
      value: async (args: Prisma.UserFindFirstArgs) => {
        const result = await this.model.findFirst(args)
        return result ? enricher.enrichUser(result) : result
      },
      writable: true,
      configurable: true,
    })

    Object.defineProperty(this, 'findFirstOrThrow', {
      value: async (args: Prisma.UserFindFirstOrThrowArgs) => {
        const result = await this.model.findFirstOrThrow(args)
        return enricher.enrichUser(result)
      },
      writable: true,
      configurable: true,
    })

    Object.defineProperty(this, 'findMany', {
      value: async (args: Prisma.UserFindManyArgs) => {
        const results = await this.model.findMany(args)
        return enricher.enrichUsers(results)
      },
      writable: true,
      configurable: true,
    })
  }
}
