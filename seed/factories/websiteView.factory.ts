import { WebsiteView } from '@prisma/client'
import { faker } from '@faker-js/faker'
import { generateFactory } from './generate'

export const websiteViewFactory = generateFactory<WebsiteView>(() => {
  return {
    createdAt: faker.date.recent({ days: 30 }),
    websiteId: faker.number.int({ min: 1, max: 1000 }),
    visitorId: faker.string.uuid(),
  }
})
