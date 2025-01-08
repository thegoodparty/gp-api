import { Campaign, CampaignTier } from '@prisma/client'
import { faker } from '@faker-js/faker'
import { STATE_CODES } from '../../src/shared/constants/states'
import { LEVELS } from '../../src/shared/constants/governmentLevels'
import { generateFactory } from './generate'

export const campaignFactory = generateFactory<Campaign>(() => {
  const electionDate = faker.date.past()
  return {
    id: faker.number.int({ max: 2147483647 }),
    createdAt: new Date(),
    updatedAt: faker.date.anytime(),
    slug: faker.lorem.words(5),
    isActive: faker.datatype.boolean(0.5),
    isVerified: faker.datatype.boolean(0.5),
    isPro: faker.datatype.boolean(0.5),
    isDemo: faker.datatype.boolean(0.1),
    didWin: faker.datatype.boolean(0.5),
    dateVerified: undefined,
    tier: faker.helpers.arrayElement(Object.values(CampaignTier)),
    data: {
      hubSpotUpdates: {
        election_results: faker.helpers.arrayElement([
          'Won General',
          'Won Primary',
          'Lost',
        ]),
        verified_candidates: faker.helpers.arrayElement(['Yes']),
        office_type: faker.lorem.text(),
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
      party: faker.helpers.arrayElement([
        'Libertarian',
        'Communist',
        'Socialist',
      ]),
      level: faker.helpers.arrayElement(['City', 'County', 'State']),
      office: faker.helpers.arrayElement([
        'Councilman',
        'President',
        'Governor',
      ]),
    },
    aiContent: {
      generationStatus: {
        launchSocialMediaCopy: {
          prompt:
            "I'm going to provide you with background information and then ask you a question....",
          status: 'completed',
          createdAt: faker.date.past().valueOf(),
          existingChat: [],
        },
      },
      launchSocialMediaCopy: {
        name: 'Launch Social Media Copy',
        content:
          '<p>📢 Exciting News! 📢 I am thrilled to announce my candidacy for the US Senate as an Independent candidate!</p>',
        updatedAt: faker.date.past().valueOf(),
        inputValues: {},
      },
    },
    vendorTsData: {},
  }
})
