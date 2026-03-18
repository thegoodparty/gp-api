import { ContentType, Prisma, PrismaClient } from '@prisma/client'
import { createClient, Entry, EntrySkeletonType } from 'contentful'

const CONTENTFUL_SPACE_ID = process.env.CONTENTFUL_SPACE_ID
const CONTENTFUL_ACCESS_TOKEN = process.env.CONTENTFUL_ACCESS_TOKEN

const RECOGNIZED_TYPES = new Set<string>(Object.values(ContentType))
const LIMIT = 300
const PAGES = 8

export default async function seedContentful(prisma: PrismaClient) {
  if (!CONTENTFUL_SPACE_ID || !CONTENTFUL_ACCESS_TOKEN) {
    console.log(
      'Skipping Contentful sync (CONTENTFUL_SPACE_ID or CONTENTFUL_ACCESS_TOKEN not set)',
    )
    return
  }

  const client = createClient({
    space: CONTENTFUL_SPACE_ID,
    accessToken: CONTENTFUL_ACCESS_TOKEN,
  })

  const allEntries: Entry<EntrySkeletonType>[] = []
  for (let i = 0; i < PAGES; i++) {
    const page = await client.getEntries({
      limit: LIMIT,
      include: 10,
      skip: i * LIMIT,
    })
    allEntries.push(...page.items)
    if (page.items.length < LIMIT) break
  }

  const recognized = allEntries.filter((entry) =>
    RECOGNIZED_TYPES.has(entry.sys.contentType.sys.id),
  )

  for (const entry of recognized) {
    const type = entry.sys.contentType.sys.id as ContentType
    const data: Prisma.InputJsonObject = {
      ...(entry.fields as Prisma.InputJsonObject),
      updateDate: new Date(entry.sys.updatedAt).toISOString().split('T')[0],
    }

    await prisma.content.upsert({
      where: { id: entry.sys.id },
      update: { data },
      create: { id: entry.sys.id, type, data },
    })
  }

  console.log(`Contentful sync: upserted ${recognized.length} entries`)
}
