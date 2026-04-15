/**
 * One-off scenario scripts for manual testing.
 *
 * Usage:
 *   npx tsx seed/scenarios.ts pro
 *   npx tsx seed/scenarios.ts demo
 *   npx tsx seed/scenarios.ts freeTexts
 */
import { Prisma, PrismaClient, UserRole } from '@prisma/client'
import { buildSlug } from '../src/shared/util/slug.util'
import { hashPasswordSync } from '../src/users/util/passwords.util'
import { getUserFullName } from '../src/users/util/users.util'
import { campaignFactory } from './factories/campaign.factory'
import { campaignPlanVersionFactory } from './factories/campaignPlanVersion.factory'
import { userFactory } from './factories/user.factory'

const PASSWORD = 'testPassword123'
const prisma = new PrismaClient()

async function createUserWithCampaign(
  email: string,
  campaignOverrides: Parameters<typeof campaignFactory>[0],
) {
  const userData = userFactory({
    email,
    password: hashPasswordSync(PASSWORD),
    hasPassword: true,
    roles: [UserRole.candidate],
  })

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      ...userData,
      metaData:
        userData.metaData !== null ? userData.metaData : Prisma.JsonNull,
    },
  })

  const campaign = await prisma.campaign.create({
    data: campaignFactory({
      userId: user.id,
      slug: buildSlug(getUserFullName(user)),
      ...campaignOverrides,
    }),
  })

  await prisma.campaignPlanVersion.create({
    data: campaignPlanVersionFactory({ campaignId: campaign.id }),
  })

  return { user, campaign }
}

async function pro() {
  const { user, campaign } = await createUserWithCampaign('pro@test.local', {
    isPro: true,
    isVerified: true,
  })
  console.log(
    `pro user:       ${user.email} / ${PASSWORD}  (campaign id: ${campaign.id})`,
  )
}

async function demo() {
  const { user, campaign } = await createUserWithCampaign('demo@test.local', {
    isDemo: true,
  })
  console.log(
    `demo user:      ${user.email} / ${PASSWORD}  (campaign id: ${campaign.id})`,
  )
}

async function freeTexts() {
  const { user, campaign } = await createUserWithCampaign(
    'freetexts@test.local',
    { hasFreeTextsOffer: true },
  )
  console.log(
    `freeTexts user: ${user.email} / ${PASSWORD}  (campaign id: ${campaign.id})`,
  )
}

const scenarios: Record<string, () => Promise<void>> = { pro, demo, freeTexts }

async function main() {
  const scenario = process.argv[2]

  if (!scenario || !scenarios[scenario]) {
    console.error(`Usage: npx tsx seed/scenarios.ts <scenario>`)
    console.error(`Scenarios: ${Object.keys(scenarios).join(', ')}`)
    process.exit(1)
  }

  await scenarios[scenario]()
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
