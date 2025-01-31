import { CampaignPlanVersion } from '@prisma/client'
import { faker } from '@faker-js/faker'
import { generateFactory } from './generate'

export const campaignPlanVersionFactory = generateFactory<CampaignPlanVersion>(
  () => ({
    id: faker.number.int({ max: 2147483647 }),
    createdAt: new Date(),
    updatedAt: faker.date.anytime(),
    campaignId: faker.number.int(),
    data: {
      pathToVictory: [
        {
          date: faker.date.anytime().toString(),
          text: faker.lorem.paragraphs(),
        },
        {
          date: faker.date.anytime().toString(),
          text: faker.lorem.paragraphs(),
        },
        {
          date: faker.date.anytime().toString(),
          text: faker.lorem.paragraphs(),
        },
      ],
    },
  }),
)
