import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

type ContentSyncResult = {
  entriesCount: number
  createEntriesCount: number
  updateEntriesCount: number
  deletedEntriesCount: number
}

async function seedContentful() {
  console.log('🔄 Syncing Contentful content...')

  const response = await fetch('http://localhost:3000/v1/content/sync')
  const result = (await response.json()) as ContentSyncResult

  console.log('✅ Contentful sync complete!')
  console.log(`   Total entries: ${result.entriesCount}`)
  console.log(`   Created: ${result.createEntriesCount}`)
  console.log(`   Updated: ${result.updateEntriesCount}`)
  console.log(`   Deleted: ${result.deletedEntriesCount}`)
}

seedContentful()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (error) => {
    console.error(error)
    await prisma.$disconnect()
    process.exit(1)
  })
