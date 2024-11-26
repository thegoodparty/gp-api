import { PrismaClient } from '@prisma/client'
import { campaignFactory } from './factories/campaign.factory'
import { campaignUpdateHistoryFactory } from './factories/campaignUpdateHistory.factory'
import { userFactory } from './factories/user.factory'
import { pathToVictoryFactory } from './factories/pathToVictory.factory'
import { countyFactory } from './factories/races/county.factory'

const NUM_COUNTIES = 2
const NUM_MUNICIPALITIES_PER_COUNTY = 2
const NUM_COUNTY_RACES = 2
const NUM_MUNICIAPLITY_RACES = 2

const NUM_CAMPAIGNS = 20
const NUM_UPDATE_HISTORY = 3

export default async function seedRaces(prisma: PrismaClient) {
  const fakeCounties: any[] = []
  const fakeMuniciaplities: any[] = []
  const fakeMunRaces: any[] = []
  const fakeCountyRaces: any[] = []

  const fakeUsers: any[] = []
  const fakeCampaigns: any[] = []
  const fakeP2Vs: any[] = []
  const fakeUpdateHistory: any[] = []

  for (let i = 0; i < NUM_COUNTIES; i++) {
    // TODO: move user seeding to its own file
    const county = countyFactory()
    console.log('county', county)

    // for (let j = 0; j < NUM_UPDATE_HISTORY; j++) {
    //   fakeUpdateHistory[NUM_UPDATE_HISTORY * i + j] =
    //     campaignUpdateHistoryFactory({
    //       campaignId: camp.id,
    //       userId: user.id,
    //     })
    // }

    // fakeUsers[i] = user
    // fakeCampaigns[i] = camp
    // fakeP2Vs[i] = p2v
  }

  // await prisma.user.createMany({ data: fakeUsers })
  // const { count } = await prisma.campaign.createMany({ data: fakeCampaigns })
  // await prisma.pathToVictory.createMany({
  //   data: fakeP2Vs,
  // })
  // await prisma.campaignUpdateHistory.createMany({ data: fakeUpdateHistory })

  console.log(`Created races`)
}
