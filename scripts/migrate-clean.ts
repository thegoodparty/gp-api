import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { createClerkClient } from '@clerk/backend'
import { SingleBar, Presets } from 'cli-progress'
import pmap from 'p-map'
import { clerkThrottle } from '../src/vendors/clerk/util/clerkThrottle.util'
import { FIXED_EMAILS } from '../seed/users'

const PRESERVE_FIXED = process.argv.includes('--preserve-fixed')
const SKIP_DB = process.argv.includes('--skip-db')
const { CLERK_SECRET_KEY, OTEL_SERVICE_ENVIRONMENT } = process.env

const NUKE_CLERK =
  process.argv.includes('--nuke-clerk-users') &&
  OTEL_SERVICE_ENVIRONMENT !== 'prod'

if (!CLERK_SECRET_KEY) {
  console.error('ERROR: CLERK_SECRET_KEY env var is required')
  process.exit(1)
}

if (CLERK_SECRET_KEY.startsWith('sk_live_')) {
  console.error(
    'ERROR: migrate:clean must NOT run against a live Clerk environment.',
  )
  process.exit(1)
}

const prisma = new PrismaClient()
const clerk = createClerkClient({ secretKey: CLERK_SECRET_KEY })

const CLERK_PAGE_LIMIT = 100

const isPreserved = (email: string): boolean =>
  PRESERVE_FIXED && FIXED_EMAILS.has(email)

const fetchAllClerkUserIds = async (): Promise<string[]> => {
  const ids: string[] = []
  let offset = 0

  while (true) {
    const page = await clerkThrottle(() =>
      clerk.users.getUserList({
        limit: CLERK_PAGE_LIMIT,
        offset,
      }),
    )

    for (const user of page.data) {
      const email = user.emailAddresses[0]?.emailAddress
      if (!email || isPreserved(email)) continue
      ids.push(user.id)
    }

    if (page.data.length < CLERK_PAGE_LIMIT) break
    offset += CLERK_PAGE_LIMIT
  }

  return ids
}

const fetchLocalClerkIds = async (): Promise<string[]> => {
  const localUsers = await prisma.user.findMany({
    where: { clerkId: { not: null } },
    select: { clerkId: true, email: true },
  })

  return localUsers.filter((u) => !isPreserved(u.email)).map((u) => u.clerkId!)
}

const deleteClerkUsers = async (userIds: string[]) => {
  let deleted = 0
  let failed = 0

  const bar = new SingleBar(
    {
      format:
        'Deleting Clerk users [{bar}] {percentage}% | {value}/{total} | deleted: {deleted} | failed: {failed}',
      hideCursor: true,
    },
    Presets.shades_classic,
  )

  bar.start(userIds.length, 0, { deleted: 0, failed: 0 })

  await pmap(userIds, async (id) => {
    try {
      await clerkThrottle(() => clerk.users.deleteUser(id))
      deleted++
    } catch (err) {
      failed++
      const message = err instanceof Error ? err.message : String(err)
      console.error(`\n  Failed to delete Clerk user ${id}: ${message}`)
    }
    bar.increment({ deleted, failed })
  })

  bar.stop()

  return deleted
}

const main = async () => {
  const clerkIds = NUKE_CLERK
    ? await fetchAllClerkUserIds()
    : await fetchLocalClerkIds()

  const source = NUKE_CLERK ? 'Clerk API' : 'local DB'
  console.log(
    `Found ${clerkIds.length} Clerk user(s) to delete (via ${source})`,
  )

  if (clerkIds.length > 0) {
    console.log('Deleting Clerk users...')
    const deleted = await deleteClerkUsers(clerkIds)
    console.log(`Deleted ${deleted}/${clerkIds.length} Clerk user(s)`)
  }

  if (!SKIP_DB) {
    console.log('Deleting all local DB users...')
    const { count } = await prisma.user.deleteMany()
    console.log(`Deleted ${count} local DB user(s)`)
  }

  console.log('Done.')
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
