import { Campaign, CampaignTier } from '@prisma/client'
import { faker } from '@faker-js/faker'
import { STATE_CODES } from '../../src/shared/constants/states'
import { LEVELS } from '../../src/shared/constants/governmentLevels'
import { generateFactory } from './generate'
import { GenerationStatus } from 'src/campaigns/ai/content/aiContent.types'

export const campaignFactory = generateFactory<Campaign>(() => {
  const electionDate = faker.date.between({
    from: faker.date.past(),
    to: faker.date.future(),
  })
  const campaign: Omit<Campaign, 'id' | 'userId'> = {
    createdAt: new Date(),
    updatedAt: faker.date.anytime(),
    slug: faker.lorem.words(5),
    isActive: faker.datatype.boolean(0.5),
    isVerified: faker.datatype.boolean(0.5),
    isPro: faker.datatype.boolean(0.5),
    isDemo: faker.datatype.boolean(0.1),
    didWin: faker.datatype.boolean(0.5),
    dateVerified: null,
    tier: faker.helpers.arrayElement(Object.values(CampaignTier)),
    data: {
      hubSpotUpdates: {
        election_results: faker.lorem.word(),
        verified_candidates: faker.helpers.arrayElement(['Yes', 'No']),
        office_type: faker.lorem.word(),
      },
    },
    details: {
      state: faker.helpers.arrayElement(STATE_CODES),
      zip: faker.location.zipCode(),
      ballotLevel: faker.helpers.arrayElement(LEVELS),
      electionDate: electionDate.toISOString().split('T')[0],
      primaryElectionDate: faker.date
        .past({ refDate: electionDate })
        .toISOString()
        .split('T')[0],
      geoLocation: {},
      party: faker.lorem.word(),
      office: faker.lorem.word(),
      raceId: faker.string.nanoid(),
      pledged: faker.datatype.boolean(0.8),
      knowRun: faker.helpers.maybe(() => 'yes', { probability: 0.6 }),
      runForOffice: faker.helpers.maybe(
        () => faker.helpers.arrayElement(['yes', 'no']),
        { probability: 0.6 },
      ),
    },
    aiContent: {
      launchSocialMediaCopy: {
        name: 'Launch Social Media Copy',
        content:
          '<p>📢 Exciting News! 📢 I am thrilled to announce my candidacy for the US Senate as an Independent candidate!</p>',
        updatedAt: faker.date.past().valueOf(),
        inputValues: {},
      },
    },
    vendorTsData: {},
    completedTaskIds: [],
  }

  // NOTE: putting this in the object literal above gives a TS error on the generationStatus key
  // see campaign.jsonTypes.ts for aiContent type definition
  campaign.aiContent['generationStatus'] = {
    launchSocialMediaCopy: {
      prompt:
        "I'm going to provide you with background information and then ask you a question....",
      status: GenerationStatus.completed,
      createdAt: faker.date.past().valueOf(),
      existingChat: undefined,
    },
  }

  return campaign
})
