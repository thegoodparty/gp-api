import { PrismaClient } from '@prisma/client'
import { campaignFactory } from './factories/campaign.factory'
import { campaignUpdateHistoryFactory } from './factories/campaignUpdateHistory.factory'
import { userFactory } from './factories/user.factory'
import { pathToVictoryFactory } from './factories/pathToVictory.factory'

const NUM_CAMPAIGNS = 20
const NUM_UPDATE_HISTORY = 3

export default async function seedCampaigns(prisma: PrismaClient) {
  const fakeUsers: any[] = []
  const fakeCampaigns: any[] = []
  const fakeP2Vs: any[] = []
  const fakeUpdateHistory: any[] = []

  const campaignIds: number[] = [];

  for (let i = 0; i < NUM_CAMPAIGNS; i++) {
    // TODO: move user seeding to its own file
    const user = userFactory()
    const camp = campaignFactory({ userId: user.id })
    const p2v = pathToVictoryFactory({ campaignId: camp.id })

    campaignIds.push(camp.id);

    for (let j = 0; j < NUM_UPDATE_HISTORY; j++) {
      fakeUpdateHistory[NUM_UPDATE_HISTORY * i + j] =
        campaignUpdateHistoryFactory({
          campaignId: camp.id,
          userId: user.id,
        })
    }

    fakeUsers[i] = user
    fakeCampaigns[i] = camp
    fakeP2Vs[i] = p2v
  }

  await prisma.user.createMany({ data: fakeUsers })
  const { count } = await prisma.campaign.createMany({ data: fakeCampaigns })
  await prisma.pathToVictory.createMany({
    data: fakeP2Vs,
  })
  await prisma.campaignUpdateHistory.createMany({ data: fakeUpdateHistory })

  console.log(`Created ${count} campaigns`);

  return campaignIds;
}
