import { PrismaClient } from '@prisma/client'
import seedCampaigns from './campaigns'
import seedTopIssues from './topIssues'
import seedUsers from './users'

const prisma = new PrismaClient()

async function main() {
  await seedUsers(prisma)
  const campaignIds = await seedCampaigns(prisma)
  await seedTopIssues(prisma, campaignIds)
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
