import { PrismaClient } from '@prisma/client'
import {
  campaignFactory,
  campaignUpdateHistoryFactory,
  pathToVictoryFactory,
} from './factories'

const NUM_CAMPAIGNS = 20
const NUM_UPDATE_HISTORY = 3

async function main() {
  const prisma = new PrismaClient()
  const fakeCampaigns = []
  const fakeP2Vs = []
  const fakeUpdateHistory = []

  for (let i = 0; i < NUM_CAMPAIGNS; i++) {
    const camp = campaignFactory()
    const p2v = pathToVictoryFactory({ campaignId: camp.id })

    for (let j = 0; j < NUM_UPDATE_HISTORY; j++) {
      fakeUpdateHistory[NUM_UPDATE_HISTORY * i + j] =
        campaignUpdateHistoryFactory({
          campaignId: camp.id,
        })
    }

    fakeCampaigns[i] = camp
    fakeP2Vs[i] = p2v
  }

  const { count } = await prisma.campaign.createMany({ data: fakeCampaigns })
  const { count: p2vCount } = await prisma.pathToVictory.createMany({
    data: fakeP2Vs,
  })
  const { count: historyCount } = await prisma.campaignUpdateHistory.createMany(
    { data: fakeUpdateHistory },
  )

  console.log(
    `Created ${count} campaigns, with ${p2vCount} paths to victory, and ${historyCount} campaign update history items`,
  )
}

main()
