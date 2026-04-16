import { Prisma, PrismaClient, User, UserRole } from '@prisma/client'
import { createClerkClient } from '@clerk/backend'
import pmap from 'p-map'
import { userFactory } from './factories/user.factory'
import { hashPasswordSync } from '../src/users/util/passwords.util'
import { clerkThrottle } from './util/clerkThrottle.util'

const NUM_USERS = 20

const ADMIN_STRIPE_CUSTOMER_ID = 'cus_RWKP2JnywRA590'

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@test.local'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'testPassword123'
const CANDIDATE_EMAIL = process.env.CANDIDATE_EMAIL || 'candidate@test.local'
const CANDIDATE_PASSWORD = process.env.CANDIDATE_PASSWORD || 'testPassword123'

const ADMIN_FIRST_NAME = 'Test'
const ADMIN_LAST_NAME = 'Admin'
export const ADMIN_USER = {
  email: ADMIN_EMAIL,
  password: hashPasswordSync(ADMIN_PASSWORD),
  hasPassword: true,
  firstName: ADMIN_FIRST_NAME,
  lastName: ADMIN_LAST_NAME,
  name: `${ADMIN_FIRST_NAME} ${ADMIN_LAST_NAME}`,
  roles: [UserRole.admin],
  metaData: {
    customerId: ADMIN_STRIPE_CUSTOMER_ID,
  },
}

const SALES_PASSWORD = 'iDoTalkAboutFightClub1'
const SALES_USER = {
  email: 'sales@fightclub.org',
  password: hashPasswordSync(SALES_PASSWORD),
  hasPassword: true,
  roles: [UserRole.sales],
}

const CANDIDATE_USER = {
  email: CANDIDATE_EMAIL,
  password: hashPasswordSync(CANDIDATE_PASSWORD),
  hasPassword: true,
  firstName: 'Test',
  lastName: 'Candidate',
  name: 'Test Candidate',
  roles: [UserRole.candidate],
}

const SERVE_PASSWORD = 'serveFightClubGreatAgain123'
export const SERVE_USER = {
  email: 'serve@fightclub.org',
  password: hashPasswordSync(SERVE_PASSWORD),
  hasPassword: true,
  roles: [UserRole.candidate],
}

const VISITOR_PASSWORD = 'tellMeAllAboutFightClub123'
const USER_W_NO_CAMPAIGN = {
  email: 'visitor@fightclub.org',
  password: hashPasswordSync(VISITOR_PASSWORD),
  hasPassword: true,
}

const FIXED_PLAINTEXT_PASSWORDS: Record<string, string> = {
  [SALES_USER.email]: SALES_PASSWORD,
  [SERVE_USER.email]: SERVE_PASSWORD,
  [USER_W_NO_CAMPAIGN.email]: VISITOR_PASSWORD,
}
export interface ClerkSeedUser {
  email: string
  password: string
  firstName: string
  lastName: string
}

export const ensureClerkUser = async (
  prisma: PrismaClient,
  localUserId: number,
  userData: ClerkSeedUser,
) => {
  const secretKey = process.env.CLERK_SECRET_KEY
  if (!secretKey) {
    console.log(
      `  [SKIP] No CLERK_SECRET_KEY — skipping Clerk sync for ${userData.email}`,
    )
    return
  }

  const clerk = createClerkClient({ secretKey })

  try {
    const clerkUser = await clerkThrottle(() =>
      clerk.users.createUser({
        emailAddress: [userData.email],
        password: userData.password,
        firstName: userData.firstName,
        lastName: userData.lastName,
        skipPasswordChecks: true,
        skipLegalChecks: true,
        externalId: String(localUserId),
      }),
    )

    await prisma.user.update({
      where: { id: localUserId },
      data: { clerkId: clerkUser.id },
    })

    const { email } = userData
    console.log(`  [CLERK] Created ${email} → ${clerkUser.id}`)
  } catch (error) {
    const { email } = userData
    const clerkErrors =
      typeof error === 'object' && error !== null && 'errors' in error
        ? (error as { errors: { code: string }[] }).errors
        : []

    const isDuplicate =
      Array.isArray(clerkErrors) &&
      clerkErrors[0]?.code === 'form_identifier_exists'

    if (isDuplicate) {
      const existing = await clerkThrottle(() =>
        clerk.users.getUserList({
          emailAddress: [email],
        }),
      )

      if (existing.data.length > 0) {
        const clerkUser = existing.data[0]
        await prisma.user.update({
          where: { id: localUserId },
          data: { clerkId: clerkUser.id },
        })
        console.log(`  [CLERK] Linked ${email} → ${clerkUser.id}`)
      }
    } else {
      console.error(`  [CLERK] Failed to sync ${email}:`, error)
    }
  }
}

const HOMER_EMAIL = 'HomerSimpson@gmail.com'

export const FIXED_EMAILS = new Set([
  ADMIN_EMAIL,
  CANDIDATE_EMAIL,
  SALES_USER.email,
  SERVE_USER.email,
  USER_W_NO_CAMPAIGN.email,
  HOMER_EMAIL,
])

const FIXED_USERS: Partial<User>[] = [
  ADMIN_USER,
  SALES_USER,
  CANDIDATE_USER,
  SERVE_USER,
  USER_W_NO_CAMPAIGN,
  {
    firstName: 'Homer',
    lastName: 'Simpson',
    email: HOMER_EMAIL,
    hasPassword: false,
  },
]

export default async function seedUsers(prisma: PrismaClient) {
  const adminUser = await prisma.user.upsert({
    where: { email: ADMIN_USER.email },
    update: {
      password: ADMIN_USER.password,
      hasPassword: ADMIN_USER.hasPassword,
      roles: ADMIN_USER.roles,
      firstName: ADMIN_USER.firstName,
      lastName: ADMIN_USER.lastName,
      name: ADMIN_USER.name,
      metaData: ADMIN_USER.metaData,
    },
    create: ADMIN_USER as Prisma.UserCreateInput,
  })

  const candidateUser = await prisma.user.upsert({
    where: { email: CANDIDATE_USER.email },
    update: {
      password: CANDIDATE_USER.password,
      hasPassword: CANDIDATE_USER.hasPassword,
      firstName: CANDIDATE_USER.firstName,
      lastName: CANDIDATE_USER.lastName,
      name: CANDIDATE_USER.name,
      roles: CANDIDATE_USER.roles,
    },
    create: CANDIDATE_USER as Prisma.UserCreateInput,
  })

  await ensureClerkUser(prisma, adminUser.id, {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    firstName: ADMIN_FIRST_NAME,
    lastName: ADMIN_LAST_NAME,
  })

  await ensureClerkUser(prisma, candidateUser.id, {
    email: CANDIDATE_EMAIL,
    password: CANDIDATE_PASSWORD,
    firstName: 'Test',
    lastName: 'Candidate',
  })

  const fakeUsers = new Array(NUM_USERS)
  const plaintextPasswords = new Map<string, string>()

  for (let i = 0; i < NUM_USERS; i++) {
    const generated = userFactory(FIXED_USERS[i])
    fakeUsers[i] = generated
    plaintextPasswords.set(
      generated.email,
      FIXED_PLAINTEXT_PASSWORDS[generated.email] ?? generated.password,
    )
  }

  const createdUsers = await prisma.user.createManyAndReturn({
    data: fakeUsers,
    skipDuplicates: true,
  })

  console.log(
    `Created ${createdUsers.length} users (skipped ${fakeUsers.length - createdUsers.length} duplicates)`,
  )

  await pmap(
    createdUsers.filter(
      (u) => plaintextPasswords.get(u.email) && u.firstName && u.lastName,
    ),
    (user) =>
      ensureClerkUser(prisma, user.id, {
        email: user.email,
        password: plaintextPasswords.get(user.email)!,
        firstName: user.firstName!,
        lastName: user.lastName!,
      }),
  )

  const upsertedIds = new Set([adminUser.id, candidateUser.id])
  const allUsers = [
    adminUser,
    candidateUser,
    ...createdUsers.filter((u) => !upsertedIds.has(u.id)),
  ]

  return allUsers.filter((u) => u.email !== USER_W_NO_CAMPAIGN.email)
}
