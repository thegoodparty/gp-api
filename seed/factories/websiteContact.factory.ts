import { WebsiteContact } from '@prisma/client'
import { faker } from '@faker-js/faker'
import { generateFactory } from './generate'

export const websiteContactFactory = generateFactory<WebsiteContact>(() => {
  const firstName = faker.person.firstName()
  const lastName = faker.person.lastName()
  const name = `${firstName} ${lastName}`

  return {
    createdAt: new Date(),
    updatedAt: faker.date.anytime(),
    websiteId: faker.number.int({ min: 1, max: 1000 }),
    name,
    email: faker.internet.email({ firstName, lastName }),
    phone: faker.helpers.maybe(
      () => faker.string.numeric({ length: 10, allowLeadingZeros: false }),
      { probability: 0.7 },
    ),
    message: faker.lorem.paragraphs(1),
    smsConsent: faker.helpers.maybe(() => true, { probability: 0.3 }),
  }
})
