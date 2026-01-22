import { PrismaService } from '../src/prisma/prisma.service'
import { ContentfulService } from '../src/vendors/contentful/contentful.service'
import { ContentService } from '../src/content/services/content.service'
import { ProcessTimersService } from '../src/shared/services/process-timers.service'

async function seedContentful() {
  console.log('🌱 Syncing Contentful content...')

  const prismaService = new PrismaService()
  await prismaService.onModuleInit()

  try {
    const contentfulService = new ContentfulService()
    const processTimersService = new ProcessTimersService()
    const contentService = new ContentService(
      contentfulService,
      processTimersService,
    )

    // We need to manually inject Prisma service
    // @ts-expect-error - Accessing private property for manual DI
    contentService._prisma = prismaService
    contentService.onModuleInit()

    const { entries, createEntries, updateEntries, deletedEntries } =
      await contentService.syncContent()

    console.log('🌳 Contentful sync complete!')
    console.log(`   Total entries: ${entries.length}`)
    console.log(`   Created: ${createEntries.length}`)
    console.log(`   Updated: ${updateEntries.length}`)
    console.log(`   Deleted: ${deletedEntries.length}`)
  } finally {
    await prismaService.onModuleDestroy()
  }
}

seedContentful()
  .then(() => {
    process.exit(0)
  })
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
