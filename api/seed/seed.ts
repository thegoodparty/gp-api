import { PrismaClient } from '@prisma/client'
import seedCampaigns from './campaigns'

const prisma = new PrismaClient()

async function main() {
  seedCampaigns(prisma)
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
