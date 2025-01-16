import {
  CampaignUpdateHistoryType,
  Prisma,
  PrismaClient,
  User,
} from '@prisma/client'
import { campaignFactory } from './factories/campaign.factory'
import { campaignUpdateHistoryFactory } from './factories/campaignUpdateHistory.factory'
import { userFactory } from './factories/user.factory'
import { pathToVictoryFactory } from './factories/pathToVictory.factory'
import { buildSlug } from 'src/shared/util/slug.util'
import { getFullName } from 'src/users/util/users.util'
import { Campaign } from '@prisma/client'
import fixedCampaigns from './fixedCampaigns.json'
import 'prisma/schema/pathToVictory.jsonTypes'
const NUM_GENERATED_CAMPAIGNS = 40
const NUM_UPDATE_HISTORY = 3
const FIXED_CAMPAIGNS: Partial<Campaign>[] = fixedCampaigns

type CampaignUpdateHistory = {
  id: number
  createdAt: Date
  updatedAt: Date
  userId: number
  campaignId: number
  type: CampaignUpdateHistoryType
  quantity: number
}

type FakeP2V = {
  id: number
  createdAt: Date
  updatedAt: Date
  campaignId: number
  data: PrismaJson.PathToVictoryData
}

export default async function seedCampaigns(
  prisma: PrismaClient,
  existingUsers: User[],
) {
  const fakeP2Vs: FakeP2V[] = []
  const fakeUpdateHistory: CampaignUpdateHistory[] = []
  const campaignIds: number[] = []

  const loopLength = Math.max(FIXED_CAMPAIGNS.length, NUM_GENERATED_CAMPAIGNS)

  for (let i = 0; i < loopLength; i++) {
    if (i < FIXED_CAMPAIGNS.length) {
      const creationData = await createCampaignAndUser(
        existingUsers,
        prisma,
        FIXED_CAMPAIGNS[i],
      )
      const { campaignId, fakeP2V, fakeUpdateHistory } = creationData

      campaignIds.push(campaignId)
      fakeP2Vs.push(fakeP2V)
      fakeUpdateHistory.push(...fakeUpdateHistory)
    }
    if (i < NUM_GENERATED_CAMPAIGNS) {
      const creationData = await createCampaignAndUser(existingUsers, prisma)
      const { campaignId, fakeP2V, fakeUpdateHistory } = creationData

      campaignIds.push(campaignId)
      fakeP2Vs.push(fakeP2V)
      fakeUpdateHistory.push(...fakeUpdateHistory)
    }
  }

  //await prisma.pathToVictory.createMany({ data: fakeP2Vs })
  await prisma.campaignUpdateHistory.createMany({ data: fakeUpdateHistory })

  console.log(`Created ${campaignIds.length} campaigns`)

  return campaignIds
}

async function createCampaignAndUser(
  existingUsers: User[],
  prisma: PrismaClient,
  fixedData?: Partial<Campaign>,
): Promise<{
  campaignId: number
  fakeP2V: FakeP2V
  fakeUpdateHistory: CampaignUpdateHistory[]
}> {
  const user = await handleUserCreation(prisma, existingUsers)
  let campaign
  if (fixedData) {
    campaign = prisma.campaign.create({
      data: campaignFactory({
        userId: user.id,
        slug: buildSlug(getFullName(user)),
        ...fixedData,
      }),
    })
  } else {
    campaign = prisma.campaign.create({
      data: campaignFactory({
        userId: user.id,
        slug: buildSlug(getFullName(user)),
      }),
    })
  }

  return {
    campaignId: campaign.id,
    fakeP2V: pathToVictoryFactory({ campaignId: campaign.id }),
    fakeUpdateHistory: createCampaignUpdateHistory(campaign, user),
  }
}

async function handleUserCreation(
  prisma: PrismaClient,
  existingUsers: User[],
): Promise<User> {
  let user = existingUsers.shift()
  if (!user) {
    const userData = userFactory()
    user = await prisma.user.create({
      data: {
        ...userData,
        metaData:
          userData.metaData !== null ? userData.metaData : Prisma.JsonNull,
      },
    })
  }
  return user
}

function createCampaignUpdateHistory(campaign: Campaign, user: User) {
  const fakeUpdateHistory: CampaignUpdateHistory[] = []
  for (let j = 0; j < NUM_UPDATE_HISTORY; j++) {
    fakeUpdateHistory.push(
      campaignUpdateHistoryFactory({
        campaignId: campaign.id,
        userId: user.id,
      }),
    )
  }
  return fakeUpdateHistory
}
