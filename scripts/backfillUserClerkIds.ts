/**
 * One-time backfill: set user.clerk_id by resolving each user's email against
 * Clerk (users with clerk_id IS NULL only).
 *
 * Usage:
 *   npx tsx scripts/backfillUserClerkIds.ts           # apply changes
 *   npx tsx scripts/backfillUserClerkIds.ts --dry-run # log only
 *
 * Required env:
 *   DATABASE_URL, CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY
 *
 * Output:
 *   scripts/output/user-clerk-id-backfill.jsonl
 */
import 'dotenv/config'
import { mkdirSync, appendFileSync } from 'fs'
import { join } from 'path'
import { createClerkClient } from '@clerk/backend'
import { PrismaClient } from '@prisma/client'
import { clerkThrottle } from '../src/vendors/clerk/util/clerkThrottle.util'

const PAGE_SIZE = 50
const OUTPUT_DIR = join(__dirname, 'output')
const LOG_PATH = join(OUTPUT_DIR, 'user-clerk-id-backfill.jsonl')

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
  let linked = 0
  let noMatch = 0
  let errors = 0

  for (;;) {
    const rows = await prisma.user.findMany({
      where: {
        id: { gt: lastId },
        clerkId: null,
      },
      orderBy: { id: 'asc' },
      take: PAGE_SIZE,
      select: { id: true, email: true },
    })

    if (rows.length === 0) break
    lastId = rows[rows.length - 1]!.id
    scanned += rows.length

    for (const row of rows) {
      try {
        const { data } = await clerkThrottle(() =>
          clerk.users.getUserList({
            emailAddress: [row.email],
            limit: 1,
          }),
        )
        const cu = data[0]
        if (!cu?.id) {
          noMatch++
          continue
        }

        const audit = {
          userId: row.id,
          email: row.email,
          clerkId: cu.id,
          dryRun,
        }
        console.log(JSON.stringify(audit))
        appendFileSync(LOG_PATH, `${JSON.stringify(audit)}\n`)

        if (!dryRun) {
          await prisma.user.update({
            where: { id: row.id },
            data: { clerkId: cu.id },
          })
        }
        linked++
      } catch (err) {
        errors++
        console.error(
          JSON.stringify({
            userId: row.id,
            email: row.email,
            error: String(err),
          }),
        )
      }
    }
  }

  console.log(
    JSON.stringify({
      done: true,
      dryRun,
      scannedUsers: scanned,
      linked,
      noMatch,
      errors,
      logFile: LOG_PATH,
    }),
  )

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
