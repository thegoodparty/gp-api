import { PrismaClient } from '@prisma/client'
import { fakeCampaignComplete } from '../prisma/faker'

const NUM_CAMPAIGNS = 20

main()

async function main() {
  const prisma = new PrismaClient()
  const fakeCampaigns = []

  for (let i = 0; i < NUM_CAMPAIGNS; i++) {
    fakeCampaigns[i] = fakeCampaignComplete()
  }

  const { count } = await prisma.campaign.createMany({ data: fakeCampaigns })

  console.log(`Created ${count} campaigns`)
}
