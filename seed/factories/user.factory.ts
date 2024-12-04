import { User } from '@prisma/client'
import { faker } from '@faker-js/faker'
import { generateFactory } from './generate'

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
    email: faker.internet.email(),
    phone: faker.phone.number(),
    zip: faker.location.zipCode(),
    metaData: {},
  }
})
