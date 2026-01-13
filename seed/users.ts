import { PrismaClient, User, UserRole } from '@prisma/client'
import { hashPasswordSync } from '../src/users/util/passwords.util'
import { userFactory } from './factories/user.factory'

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

const SALES_USER = {
  email: 'sales@fightclub.org',
  password: hashPasswordSync('iDoTalkAboutFightClub1'),
  hasPassword: true,
  roles: [UserRole.sales],
}

const CANDIDATE_USER = {
  email: CANDIDATE_EMAIL,
  password: hashPasswordSync(CANDIDATE_PASSWORD),
  hasPassword: true,
  roles: [UserRole.candidate],
}

export const SERVE_USER = {
  email: 'serve@fightclub.org',
  password: hashPasswordSync('serveFightClubGreatAgain123'),
  hasPassword: true,
  roles: [UserRole.candidate],
}

const USER_W_NO_CAMPAIGN = {
  email: 'visitor@fightclub.org',
  password: hashPasswordSync('tellMeAllAboutFightClub123'),
  hasPassword: true,
}
// define some user objects here for non random seeds
const FIXED_USERS: Partial<User>[] = [
  ADMIN_USER,
  SALES_USER,
  CANDIDATE_USER,
  SERVE_USER,
  USER_W_NO_CAMPAIGN,
  {
    firstName: 'Homer',
    lastName: 'Simpson',
    email: 'HomerSimpson@gmail.com',
    hasPassword: false,
  },
]

export default async function seedUsers(prisma: PrismaClient) {
  const fakeUsers = new Array(NUM_USERS)

  for (let i = 0; i < NUM_USERS; i++) {
    fakeUsers[i] = userFactory(FIXED_USERS[i])
  }

  const users = await prisma.user.createManyAndReturn({
    data: fakeUsers,
    skipDuplicates: true,
  })

  console.log(
    `Created ${users.length} users (skipped ${fakeUsers.length - users.length} duplicates)`,
  )

  // Filter out users to not create campaigns for them with seedCampaigns
  return users.filter((u) => u.email !== USER_W_NO_CAMPAIGN.email)
}
