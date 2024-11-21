import { PrismaClient } from '@prisma/client'
import {
  campaignFactory,
  campaignUpdateHistoryFactory,
  pathToVictoryFactory,
  userFactory,
} from './factories'

const NUM_CAMPAIGNS = 20
const NUM_UPDATE_HISTORY = 3

async function main() {
  const prisma = new PrismaClient()
  const fakeUsers = []
  const fakeCampaigns = []
  const fakeP2Vs = []
  const fakeUpdateHistory = []

  for (let i = 0; i < NUM_CAMPAIGNS; i++) {
    const user = userFactory()
    const camp = campaignFactory({ userId: user.id })
    const p2v = pathToVictoryFactory({ campaignId: camp.id })

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

  console.log(`Created ${count} campaigns`)
}

main()
