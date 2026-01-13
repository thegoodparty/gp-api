import {
  BadGatewayException,
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
} from '@nestjs/common'
import { Interval } from '@nestjs/schedule'
import { Campaign, Prisma, User } from '@prisma/client'
import { subHours } from 'date-fns'
import { chunk } from 'es-toolkit'
import ms from 'ms'
import throttle from 'p-throttle'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { WithOptional } from 'src/shared/types/utility.types'
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

const REGISTER_USER_CRM_FORM_ID = '37d98f01-7062-405f-b0d1-c95179057db1'

@Injectable()
export class UsersService extends createPrismaBase(MODELS.User) {
  constructor(
    @Inject(forwardRef(() => AnalyticsService))
    private readonly analytics: AnalyticsService,
    @Inject(forwardRef(() => CrmUsersService))
    private readonly crm: CrmUsersService,
    @Inject(forwardRef(() => StripeService))
    private readonly stripeService: StripeService,
  ) {
    super()
  }

  findUser(where: Prisma.UserWhereUniqueInput) {
    return this.findUnique({
      where,
    })
  }

  findUserByEmail(email: string) {
    return this.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
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
        email: { equals: email, mode: 'insensitive' },
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

  async updateUser(
    where: Prisma.UserWhereUniqueInput,
    data: Prisma.UserUpdateInput,
  ) {
    return this.model.update({
      where,
      data,
    })
  }

  async patchUserMetaData(
    userId: number,
    newMetaData: PrismaJson.UserMetaData,
  ) {
    const updatedUser = await this.optimisticLockingUpdate(
      { where: { id: userId } },
      (user) => {
        this.logger.log(
          `User ${user.id} metadata pre-update: ${JSON.stringify(user.metaData ?? {})}`,
        )
        return {
          metaData: { ...(user.metaData ?? {}), ...(newMetaData ?? {}) },
        }
      },
    )
    this.logger.log(
      `User ${updatedUser.id} metadata post-update: ${JSON.stringify(updatedUser.metaData ?? {})}`,
    )

    return updatedUser
  }

  async deleteUser(id: number) {
    const user = await this.model.findUnique({
      where: { id },
      include: { campaigns: true },
    })

    const campaign = user?.campaigns?.[0]
    const subscriptionId = (campaign?.details as { subscriptionId?: string })
      ?.subscriptionId

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
            `Failed to cancel subscription ${subscriptionId}: ${stripeError.message} ${JSON.stringify(
              {
                code: stripeError.code,
                type: stripeError.type,
                statusCode: stripeError.statusCode,
              },
            )}`,
          )
        } else {
          this.logger.error(
            `Unexpected error canceling subscription ${subscriptionId}`,
            error,
          )
        }
        throw new BadGatewayException(
          `Failed to cancel subscription before user deletion`,
        )
      }
    }
    return this.model.delete({
      where: {
        id,
      },
    })
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

  /**
   * Regularly automatically delete old test users that were
   * created more than 3 hours ago.
   */
  @Interval(ms('6h'))
  async deleteTestUsers() {
    const testUsers = await this.model.findMany({
      where: {
        email: { endsWith: '@test.goodparty.org' },
        createdAt: { lt: subHours(new Date(), 3) },
      },
    })

    this.logger.log(`Found ${testUsers.length} test users to delete`)

    const deleteUsers = throttle({ limit: 1, interval: 1000 })(
      async (userIds: number[]) =>
        this.model.deleteMany({ where: { id: { in: userIds } } }),
    )

    for (const users of chunk(testUsers, 10)) {
      await deleteUsers(users.map((user) => user.id))
      this.logger.log(
        JSON.stringify({
          ids: users.map((user) => user.id),
          msg: 'Deleted users',
        }),
      )
    }
  }
}
