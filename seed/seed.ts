import { PrismaClient } from '@prisma/client'
import { parseArgs } from 'util'

// factory seeds
import seedCampaigns from './campaigns'
import seedTopIssues from './topIssues'
import seedUsers, { ADMIN_USER } from './users'
import seedWebsiteContacts from './websiteContacts'
// csv file seeds
import seedElectionTypes from './electionTypes'
import seedMtfcc from './mtfcc'
import seedCounties from './counties'
import seedMunicipalities from './municipalities'
import { seedEcanvasserDemoAccount } from './util/seedEcanvasserDemoAccount.util'

const LIMIT_SEEDS =
  process.env.NODE_ENV === 'production' ||
  process.env.NODE_ENV === 'qa' ||
  process.env.NODE_ENV === 'development'

const prisma = new PrismaClient()

async function main() {
  if (LIMIT_SEEDS) {
    // only want to run seeds from CSV files in prod, qa, or dev
    await csvSeeds(prisma, true)
  } else {
    const seedType = getTypeArg()

    if (seedType === 'csv' || seedType === 'all') {
      await csvSeeds(prisma)

      // if only running csv file seeds, return early
      if (seedType === 'csv') return
    }

    // run factory seeds
    const users = await seedUsers(prisma)
    const campaignIds = await seedCampaigns(prisma, users)
    await seedTopIssues(prisma, campaignIds)
    await seedEcanvasserDemoAccount(ADMIN_USER.email, prisma)
    await seedWebsiteContacts(prisma)
  }
}

async function csvSeeds(prisma: PrismaClient, loadAll = false) {
  await seedMtfcc(prisma)
  await seedElectionTypes(prisma)
  await seedCounties(prisma, loadAll)
  await seedMunicipalities(prisma, loadAll)
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

function getTypeArg() {
  const { values } = parseArgs({
    options: {
      type: { type: 'string', short: 't' },
    },
  })
  return values.type
}
