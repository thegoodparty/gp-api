import { Prisma, PrismaClient, User } from '@prisma/client'
import { campaignFactory } from './factories/campaign.factory'
import { campaignUpdateHistoryFactory } from './factories/campaignUpdateHistory.factory'
import { userFactory } from './factories/user.factory'
import { pathToVictoryFactory } from './factories/pathToVictory.factory'
import { buildSlug } from 'src/shared/util/slug.util'
import { getFullName } from 'src/users/util/users.util'

const NUM_CAMPAIGNS = 20
const NUM_UPDATE_HISTORY = 3

export default async function seedCampaigns(
  prisma: PrismaClient,
  existingUsers: User[],
) {
  const fakeCampaigns: any[] = []
  const fakeP2Vs: any[] = []
  const fakeUpdateHistory: any[] = []

  const campaignIds: number[] = []

  for (let i = 0; i < NUM_CAMPAIGNS; i++) {
    let user = existingUsers[i]
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
    const campaign = campaignFactory({
      userId: user.id,
      slug: buildSlug(getFullName(user)),
    })

    campaignIds.push(campaign.id)
    fakeCampaigns.push(campaign)
    fakeP2Vs.push(pathToVictoryFactory({ campaignId: campaign.id }))

    for (let j = 0; j < NUM_UPDATE_HISTORY; j++) {
      fakeUpdateHistory.push(
        campaignUpdateHistoryFactory({
          campaignId: campaign.id,
          userId: user.id,
        }),
      )
    }
  }

  const { count } = await prisma.campaign.createMany({ data: fakeCampaigns })
  await prisma.pathToVictory.createMany({
    data: fakeP2Vs,
  })

  await prisma.campaignUpdateHistory.createMany({ data: fakeUpdateHistory })

  console.log(`Created ${count} campaigns`)

  return campaignIds
}
