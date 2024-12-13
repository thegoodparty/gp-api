import { PrismaClient } from '@prisma/client'
import { campaignFactory } from './factories/campaign.factory'
import { campaignUpdateHistoryFactory } from './factories/campaignUpdateHistory.factory'
import { userFactory } from './factories/user.factory'
import { pathToVictoryFactory } from './factories/pathToVictory.factory'
import { genSalt, genSaltSync, hash, hashSync } from 'bcrypt'

const NUM_CAMPAIGNS = 20
const NUM_UPDATE_HISTORY = 3

export default async function seedCampaigns(prisma: PrismaClient) {
  const fakeUsers: any[] = []
  const fakeCampaigns: any[] = []
  const fakeP2Vs: any[] = []
  const fakeUpdateHistory: any[] = []

  const existingUsers = await prisma.user.findMany({ take: NUM_CAMPAIGNS })

  const campaignIds: number[] = []

  for (let i = 0; i < NUM_CAMPAIGNS; i++) {
    let user = existingUsers[i]
    if (!user) {
      user = userFactory()
      fakeUsers.push(user)
    }
    const camp = campaignFactory({ userId: user.id })

    campaignIds.push(camp.id)
    fakeCampaigns.push(camp)
    fakeP2Vs.push(pathToVictoryFactory({ campaignId: camp.id }))

    for (let j = 0; j < NUM_UPDATE_HISTORY; j++) {
      fakeUpdateHistory.push(
        campaignUpdateHistoryFactory({
          campaignId: camp.id,
          userId: user.id,
        }),
      )
    }
  }

  await prisma.user.createMany({ data: fakeUsers })
  const { count } = await prisma.campaign.createMany({ data: fakeCampaigns })
  await prisma.pathToVictory.createMany({
    data: fakeP2Vs,
  })
  await prisma.campaignUpdateHistory.createMany({ data: fakeUpdateHistory })

  console.log(`Created ${count} campaigns`)

  return campaignIds
}
