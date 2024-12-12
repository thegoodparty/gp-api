import { PrismaClient } from '@prisma/client'
import seedCampaigns from './campaigns'
import seedTopIssues from './topIssues'

const prisma = new PrismaClient()

async function main() {
  const campaignIds = await seedCampaigns(prisma);
  await seedTopIssues(prisma, campaignIds);
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
