import { PrismaClient, User, UserRole } from '@prisma/client'
import { userFactory } from './factories/user.factory'
import { hashPasswordSync } from 'src/users/util/passwords.util'

const NUM_USERS = 20

const ADMIN_STRIPE_CUSTOMER_ID = 'cus_RWKP2JnywRA590'

const ADMIN_FIRST_NAME = 'Tyler'
const ADMIN_LAST_NAME = 'Durden'
export const ADMIN_USER = {
  email: 'tyler@fightclub.org',
  password: hashPasswordSync('no1TalksAboutFightClub'),
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
  email: 'candidate@fightclub.org',
  password: hashPasswordSync('makeFightClubGreatAgain123'),
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

  const users = await prisma.user.createManyAndReturn({ data: fakeUsers })

  console.log(`Created ${users.length} users`)

  // Filter out users to not create campaigns for them with seedCampaigns
  return users.filter((u) => u.email !== USER_W_NO_CAMPAIGN.email)
}
