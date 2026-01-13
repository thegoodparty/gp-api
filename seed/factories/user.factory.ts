import { faker } from '@faker-js/faker'
import { User, UserRole } from '@prisma/client'
import { generateRandomPassword } from '../../src/users/util/passwords.util'
import { generateFactory } from './generate'

// filter admin from seeded users
const seedRoles = Object.values(UserRole).filter((r) => r !== UserRole.admin)

export const userFactory = generateFactory<User>(() => {
  const firstName = faker.person.firstName()
  const lastName = faker.person.lastName()
  const name = `${firstName} ${lastName}`
  return {
    createdAt: new Date(),
    updatedAt: faker.date.anytime(),
    firstName,
    lastName,
    name,
    email: faker.internet.email({ provider: 'goodparty.org' }).toLowerCase(),
    password: generateRandomPassword(),
    hasPassword: true,
    phone: faker.string.numeric({ length: 10, allowLeadingZeros: false }),
    zip: faker.location.zipCode(),
    roles: [faker.helpers.arrayElement(seedRoles)],
    metaData: {},
  }
})
