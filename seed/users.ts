import { PrismaClient, User, UserRole } from '@prisma/client'
import { userFactory } from './factories/user.factory'
import { hashPasswordSync } from 'src/users/util/passwords.util'

const NUM_USERS = 20

const ADMIN_FIRST_NAME = 'Tyler'
const ADMIN_LAST_NAME = 'Durden'
const ADMIN_USER = {
  email: 'tyler@fightclub.org',
  password: hashPasswordSync('no1TalksAboutFightClub'),
  firstName: ADMIN_FIRST_NAME,
  lastName: ADMIN_LAST_NAME,
  name: `${ADMIN_FIRST_NAME} ${ADMIN_LAST_NAME}`,
  roles: [UserRole.admin],
}

const SALES_USER = {
  email: 'sales@fightclub.org',
  password: hashPasswordSync('iDoTalkAboutFightClub1'),
  roles: [UserRole.sales],
}

const CANDIDATE_USER = {
  email: 'candidate@fightclub.org',
  password: hashPasswordSync('makeFightClubGreatAgain123'),
  roles: [UserRole.candidate],
}

// define some user objects here for non random seeds
const FIXED_USERS: Partial<User>[] = [
  ADMIN_USER,
  SALES_USER,
  CANDIDATE_USER,
  {
    id: 1,
    firstName: 'Homer',
    lastName: 'Simpson',
    email: 'HomerSimpson@gmail.com',
  },
]

export default async function seedUsers(prisma: PrismaClient) {
  const fakeUsers = new Array(NUM_USERS)

  for (let i = 0; i < NUM_USERS; i++) {
    fakeUsers[i] = userFactory(FIXED_USERS[i])
  }

  const { count } = await prisma.user.createMany({ data: fakeUsers })

  console.log(`Created ${count} users`)
}
