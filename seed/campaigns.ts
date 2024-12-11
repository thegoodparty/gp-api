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

  for (let i = 0; i < NUM_CAMPAIGNS; i++) {
    // TODO: move user seeding to its own file
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

  const ADMIN_FIRST_NAME = 'Tyler'
  const ADMIN_LAST_NAME = 'Durden'
  const adminUser = {
    ...userFactory(),
    email: 'tyler@fightclub.org',
    password: hashSync('no1TalksAboutFightClub', genSaltSync()),
    firstName: ADMIN_FIRST_NAME,
    lastName: ADMIN_LAST_NAME,
    name: `${ADMIN_FIRST_NAME} ${ADMIN_LAST_NAME}`,
    roles: ['admin'],
  }

  fakeUsers.push(adminUser)

  await prisma.user.createMany({ data: fakeUsers })
  const { count } = await prisma.campaign.createMany({ data: fakeCampaigns })
  await prisma.pathToVictory.createMany({
    data: fakeP2Vs,
  })
  await prisma.campaignUpdateHistory.createMany({ data: fakeUpdateHistory })

  console.log(`Created ${count} campaigns`)
}
