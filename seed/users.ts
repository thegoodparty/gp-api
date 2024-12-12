import { PrismaClient, User } from '@prisma/client'
import { userFactory } from './factories/user.factory'

const NUM_USERS = 20

// define some user objects here for non random seeds
const FIXED_USERS: Partial<User>[] = [
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
