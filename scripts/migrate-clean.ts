import { PrismaClient } from '@prisma/client'
import { createClerkClient } from '@clerk/backend'
import { SingleBar, Presets } from 'cli-progress'
import pmap from 'p-map'
import { clerkThrottle } from '../seed/util/clerkThrottle.util'

const BATCH_SIZE = 100

const { CLERK_SECRET_KEY } = process.env

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

const fetchAllClerkUsers = async () => {
  const allUserIds: string[] = []
  let offset = 0

  while (true) {
    const batch = await clerkThrottle(() =>
      clerk.users.getUserList({
        limit: BATCH_SIZE,
        offset,
      }),
    )

    if (batch.data.length === 0) break

    allUserIds.push(...batch.data.map((u) => u.id))
    offset += batch.data.length

    if (batch.data.length < BATCH_SIZE) break
  }

  return allUserIds
}

const deleteClerkUsers = async (userIds: string[]) => {
  let deleted = 0
  let failed = 0

  const bar = new SingleBar(
    {
      format:
        'Deleting Clerk users [{bar}] {percentage}% | ' +
        '{value}/{total} | deleted: {deleted} | ' +
        'failed: {failed}',
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
  console.log('Fetching all Clerk users...')
  const clerkUserIds = await fetchAllClerkUsers()
  console.log(`Found ${clerkUserIds.length} Clerk user(s)`)

  if (clerkUserIds.length > 0) {
    console.log('Deleting Clerk users...')
    const deleted = await deleteClerkUsers(clerkUserIds)
    console.log(`Deleted ${deleted}/${clerkUserIds.length} Clerk user(s)`)
  }

  console.log('Deleting all local DB users...')
  const { count } = await prisma.user.deleteMany()
  console.log(`Deleted ${count} local DB user(s)`)

  console.log('Done.')
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
