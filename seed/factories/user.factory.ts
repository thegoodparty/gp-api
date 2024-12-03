import { User } from '@prisma/client'
import { faker } from '@faker-js/faker'
import { generateFactory } from './generate'

export const userFactory = generateFactory<User>(() => ({
  id: faker.number.int({ max: 2147483647 }),
  createdAt: new Date(),
  updatedAt: faker.date.anytime(),
  firstName: faker.person.firstName(),
  lastName: faker.person.lastName(),
  email: faker.internet.email(),
  phone: faker.phone.number(),
  zip: faker.location.zipCode(),
  metaData: {},
}))
