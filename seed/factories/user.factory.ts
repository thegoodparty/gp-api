import { User } from '@prisma/client'
import { faker } from '@faker-js/faker'
import { generateFactory } from './generate'
import { generateRandomPassword } from '../../src/users/util/passwords.util'

export const userFactory = generateFactory<User>(() => {
  const firstName = faker.person.firstName()
  const lastName = faker.person.lastName()
  const name = `${firstName} ${lastName}`
  return {
    id: faker.number.int({ max: 2147483647 }),
    createdAt: new Date(),
    updatedAt: faker.date.anytime(),
    firstName,
    lastName,
    name,
    email: faker.internet.email().toLowerCase(),
    password: generateRandomPassword(),
    phone: faker.number.int({ min: 1000000000, max: 9999999999 }).toString(),
    zip: faker.location.zipCode(),
    metaData: {},
  }
})
