import { Prisma, PrismaClient, User } from '@prisma/client'
import { campaignFactory } from './factories/campaign.factory'
import { campaignUpdateHistoryFactory } from './factories/campaignUpdateHistory.factory'
import { userFactory } from './factories/user.factory'
import { pathToVictoryFactory } from './factories/pathToVictory.factory'
import { buildSlug } from 'src/shared/util/slug.util'
import { getFullName } from 'src/users/util/users.util'
import { Campaign } from '@prisma/client'
// eslint-disable-next-line
//const fixedCampaigns = require('./fixedCampaigns.json') // Normal import doesn't correctly recognize it as an array
import fixedCampaigns from './fixedCampaigns.json'
console.dir(fixedCampaigns, { colors: true, depth: 4 })
const NUM_CAMPAIGNS = 40
const NUM_UPDATE_HISTORY = 3
const FIXED_CAMPAIGNS: Partial<Campaign>[] = fixedCampaigns

export default async function seedCampaigns(
  prisma: PrismaClient,
  existingUsers: User[],
) {
  const fakeP2Vs: any[] = []
  const fakeUpdateHistory: any[] = []

  const campaignIds: number[] = []

  for (const fixedCampaign of FIXED_CAMPAIGNS) {
    const user = await handleUserCreation(prisma, existingUsers)
    const campaignData = campaignFactory({
      userId: user.id,
      ...fixedCampaign,
    })

    const createdCampaign = await prisma.campaign.create({
      data: campaignData,
    })

    campaignIds.push(createdCampaign.id)
    fakeP2Vs.push(pathToVictoryFactory({ campaignId: createdCampaign.id }))
    fakeUpdateHistory.push(
      ...createCampaignUpdateHistory(createdCampaign, user),
    )
  }
  for (let i = 0; i < NUM_CAMPAIGNS; i++) {
    const user = await handleUserCreation(prisma, existingUsers)
    const campaign = await prisma.campaign.create({
      data: campaignFactory({
        userId: user.id,
        slug: buildSlug(getFullName(user)),
      }),
    })

    campaignIds.push(campaign.id)
    fakeP2Vs.push(pathToVictoryFactory({ campaignId: campaign.id }))
    fakeUpdateHistory.push(...createCampaignUpdateHistory(campaign, user))
  }

  await prisma.pathToVictory.createMany({ data: fakeP2Vs })
  await prisma.campaignUpdateHistory.createMany({ data: fakeUpdateHistory })

  console.log(`Created ${campaignIds.length} campaigns`)

  return campaignIds
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
  const fakeUpdateHistory: any[] = []
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
