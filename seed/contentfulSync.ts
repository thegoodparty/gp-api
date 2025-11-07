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

  const API_URL = 'http://localhost:3000/v1/content/sync'

  try {
    const response = await fetch(API_URL)

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const result = (await response.json()) as ContentSyncResult

    console.log('✅ Contentful sync complete!')
    console.log(`   Total entries: ${result.entriesCount}`)
    console.log(`   Created: ${result.createEntriesCount}`)
    console.log(`   Updated: ${result.updateEntriesCount}`)
    console.log(`   Deleted: ${result.deletedEntriesCount}`)
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(
        `Cannot connect to ${API_URL}\nMake sure the API server is running (npm run start:dev)`,
      )
    }
    throw error
  }
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
