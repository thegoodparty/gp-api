/**
 * One-time backfill: sync firstName, lastName, and name from Clerk into the
 * local `user` table for every row with a non-null clerk_id.
 *
 * Uses the same truthiness rules as ClerkUserEnricherService: only write a
 * field when Clerk returns a non-empty value and it differs from the DB.
 *
 * Usage:
 *   npx tsx scripts/backfillUserNamesFromClerk.ts           # apply changes
 *   npx tsx scripts/backfillUserNamesFromClerk.ts --dry-run # log only
 *
 * Required env:
 *   DATABASE_URL, CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY
 *
 * Output (scripts/output/, gitignored if present):
 *   user-names-backfill.jsonl — one JSON object per updated user
 */
import 'dotenv/config'
import { mkdirSync, appendFileSync } from 'fs'
import { join } from 'path'
import { createClerkClient } from '@clerk/backend'
import { PrismaClient } from '@prisma/client'
import { clerkThrottle } from '../src/vendors/clerk/util/clerkThrottle.util'

const BATCH_SIZE = 100
const OUTPUT_DIR = join(__dirname, 'output')
const LOG_PATH = join(OUTPUT_DIR, 'user-names-backfill.jsonl')

function truthy(s: string | null | undefined): s is string {
  return Boolean(s && String(s).trim().length > 0)
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const publishableKey = process.env.CLERK_PUBLISHABLE_KEY
  const secretKey = process.env.CLERK_SECRET_KEY
  if (!publishableKey || !secretKey) {
    throw new Error('CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY must be set')
  }

  const prisma = new PrismaClient()
  const clerk = createClerkClient({ publishableKey, secretKey })

  try {
    mkdirSync(OUTPUT_DIR, { recursive: true })
  } catch {
    // ignore
  }

  let lastId = 0
  let scanned = 0
  let updatedRows = 0
  let skippedNoClerkUser = 0

  for (;;) {
    const batch = await prisma.user.findMany({
      where: {
        id: { gt: lastId },
        clerkId: { not: null },
      },
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
      select: {
        id: true,
        clerkId: true,
        firstName: true,
        lastName: true,
        name: true,
      },
    })

    if (batch.length === 0) break

    lastId = batch[batch.length - 1]!.id
    scanned += batch.length

    const clerkIds = batch.map((u) => u.clerkId!).filter(Boolean)
    const clerkById = new Map<
      string,
      { firstName: string | null; lastName: string | null; name: string | null }
    >()

    try {
      const { data } = await clerkThrottle(() =>
        clerk.users.getUserList({
          userId: clerkIds,
          limit: clerkIds.length,
        }),
      )
      for (const cu of data) {
        const fn = cu.firstName ?? null
        const ln = cu.lastName ?? null
        const fallback = [fn, ln].filter(Boolean).join(' ').trim()
        const name =
          cu.fullName ?? (fallback.length > 0 ? fallback : null) ?? null
        clerkById.set(cu.id, { firstName: fn, lastName: ln, name })
      }
    } catch (err) {
      console.error('Clerk bulk fetch failed for batch starting after id', lastId, err)
      continue
    }

    for (const row of batch) {
      const cid = row.clerkId!
      const c = clerkById.get(cid)
      if (!c) {
        skippedNoClerkUser++
        continue
      }

      const nextFirst = truthy(c.firstName) ? c.firstName!.trim() : null
      const nextLast = truthy(c.lastName) ? c.lastName!.trim() : null
      const nextName = truthy(c.name) ? c.name!.trim() : null

      const data: {
        firstName?: string
        lastName?: string
        name?: string
      } = {}

      if (nextFirst != null && nextFirst !== (row.firstName ?? '')) {
        data.firstName = nextFirst
      }
      if (nextLast != null && nextLast !== (row.lastName ?? '')) {
        data.lastName = nextLast
      }
      if (nextName != null && nextName !== (row.name ?? '')) {
        data.name = nextName
      }

      if (Object.keys(data).length === 0) continue

      const audit = {
        userId: row.id,
        clerkId: cid,
        before: {
          firstName: row.firstName,
          lastName: row.lastName,
          name: row.name,
        },
        after: data,
        dryRun,
      }
      console.log(JSON.stringify(audit))
      appendFileSync(LOG_PATH, `${JSON.stringify(audit)}\n`)

      if (!dryRun) {
        await prisma.user.update({
          where: { id: row.id },
          data,
        })
      }
      updatedRows++
    }
  }

  console.log(
    JSON.stringify({
      done: true,
      dryRun,
      scannedUsers: scanned,
      updatedRows,
      skippedNoClerkUserInBulkResponse: skippedNoClerkUser,
      logFile: LOG_PATH,
    }),
  )

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
