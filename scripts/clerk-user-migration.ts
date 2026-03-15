/**
 * Bulk User Migration Script: gp-api → Clerk
 *
 * Imports all existing gp-api users into Clerk with their bcrypt password hashes,
 * then stores the Clerk user ID back in gp-api's `User.clerkId` field.
 *
 * This script is idempotent — it only processes users where `clerkId IS NULL`,
 * so it can be safely re-run if interrupted or if new users are added.
 *
 * Prerequisites:
 *   - DATABASE_URL must be set (reads from .env automatically via Prisma)
 *   - CLERK_SECRET_KEY must be set
 *   - CLERK_PUBLISHABLE_KEY must be set
 *
 * Usage:
 *   npx tsx scripts/clerk-user-migration.ts
 *
 * Optional flags:
 *   --dry-run    Log what would happen without making any changes
 *   --batch-size Override the default batch size (default: 50)
 *   --limit      Only process N users (useful for testing)
 */
import { PrismaClient } from '@prisma/client'
import { createClerkClient } from '@clerk/backend'

const BATCH_SIZE = parseInt(process.argv.find((a) => a.startsWith('--batch-size='))?.split('=')[1] ?? '50', 10)
const RATE_LIMIT_DELAY_MS = 3_000
const DRY_RUN = process.argv.includes('--dry-run')
const LIMIT = parseInt(process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1] ?? '0', 10) || undefined

const { CLERK_SECRET_KEY, CLERK_PUBLISHABLE_KEY } = process.env

if (!CLERK_SECRET_KEY) {
  console.error('ERROR: CLERK_SECRET_KEY environment variable is required')
  process.exit(1)
}
if (!CLERK_PUBLISHABLE_KEY) {
  console.error('ERROR: CLERK_PUBLISHABLE_KEY environment variable is required')
  process.exit(1)
}

const prisma = new PrismaClient()
const clerk = createClerkClient({
  secretKey: CLERK_SECRET_KEY,
  publishableKey: CLERK_PUBLISHABLE_KEY,
})

interface MigrationResult {
  imported: number
  linked: number
  skipped: number
  failed: number
  failures: { userId: number; email: string; error: string }[]
}

interface ClerkApiErrorItem {
  code: string
  message: string
  longMessage?: string
}

interface ClerkApiError {
  errors: ClerkApiErrorItem[]
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isClerkApiError(error: unknown): error is ClerkApiError {
  if (typeof error !== 'object' || error === null || !('errors' in error)) {
    return false
  }
  return Array.isArray(error.errors) && error.errors.length > 0
}

function getClerkErrorCode(error: unknown): string | undefined {
  return isClerkApiError(error) ? error.errors[0]?.code : undefined
}

function getClerkErrorMessage(error: unknown): string {
  if (isClerkApiError(error)) {
    const first = error.errors[0]
    return first?.longMessage ?? first?.message ?? 'Unknown Clerk error'
  }
  return error instanceof Error ? error.message : String(error)
}

async function migrateUser(
  user: { id: number; email: string; firstName: string | null; lastName: string | null; password: string | null; hasPassword: boolean },
  result: MigrationResult,
): Promise<void> {
  const normalizedEmail = user.email.trim().toLowerCase()

  if (DRY_RUN) {
    console.log(`  [DRY RUN] Would migrate user #${user.id} (${normalizedEmail})`)
    result.skipped++
    return
  }

  try {
    const baseParams = {
      emailAddress: [normalizedEmail],
      firstName: user.firstName || undefined,
      lastName: user.lastName || undefined,
      skipLegalChecks: true,
      externalId: String(user.id),
    }

    const params = user.hasPassword && user.password
      ? {
          ...baseParams,
          passwordDigest: user.password,
          passwordHasher: 'bcrypt' as const,
          skipPasswordChecks: true,
        }
      : {
          ...baseParams,
          skipPasswordRequirement: true,
        }

    const clerkUser = await clerk.users.createUser(params)

    await prisma.user.update({
      where: { id: user.id },
      data: { clerkId: clerkUser.id },
    })

    result.imported++
    console.log(`  [OK] User #${user.id} (${normalizedEmail}) → ${clerkUser.id}`)
  } catch (error) {
    const errorCode = getClerkErrorCode(error)

    if (errorCode === 'form_identifier_exists') {
      try {
        const existingUsers = await clerk.users.getUserList({
          emailAddress: [normalizedEmail],
        })

        if (existingUsers.data.length > 0) {
          const existingClerkUser = existingUsers.data[0]

          await prisma.user.update({
            where: { id: user.id },
            data: { clerkId: existingClerkUser.id },
          })

          result.linked++
          console.log(`  [LINKED] User #${user.id} (${normalizedEmail}) → existing Clerk user ${existingClerkUser.id}`)
        } else {
          result.failed++
          result.failures.push({
            userId: user.id,
            email: normalizedEmail,
            error: 'form_identifier_exists but getUserList returned no results',
          })
          console.error(`  [FAIL] User #${user.id} (${normalizedEmail}): email exists in Clerk but lookup returned empty`)
        }
      } catch (lookupError) {
        result.failed++
        result.failures.push({
          userId: user.id,
          email: normalizedEmail,
          error: `Duplicate handling failed: ${getClerkErrorMessage(lookupError)}`,
        })
        console.error(`  [FAIL] User #${user.id} (${normalizedEmail}): duplicate handling error: ${getClerkErrorMessage(lookupError)}`)
      }
    } else {
      result.failed++
      result.failures.push({
        userId: user.id,
        email: normalizedEmail,
        error: getClerkErrorMessage(error),
      })
      console.error(`  [FAIL] User #${user.id} (${normalizedEmail}): ${getClerkErrorMessage(error)}`)
    }
  }
}

async function main() {
  console.log('=== Clerk User Migration ===')
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`)
  console.log(`Batch size: ${BATCH_SIZE}`)
  if (LIMIT) console.log(`Limit: ${LIMIT} users`)
  console.log()

  const totalUsers = await prisma.user.count()
  const alreadyMigrated = await prisma.user.count({ where: { clerkId: { not: null } } })
  const pendingMigration = await prisma.user.count({ where: { clerkId: null } })

  console.log(`Total users in database:    ${totalUsers}`)
  console.log(`Already migrated (clerkId): ${alreadyMigrated}`)
  console.log(`Pending migration:          ${pendingMigration}`)
  console.log()

  if (pendingMigration === 0) {
    console.log('All users already have a clerkId. Nothing to do.')
    return
  }

  const usersToMigrate = await prisma.user.findMany({
    where: { clerkId: null },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      password: true,
      hasPassword: true,
    },
    orderBy: { id: 'asc' },
    ...(LIMIT ? { take: LIMIT } : {}),
  })

  console.log(`Fetched ${usersToMigrate.length} users to process.`)
  console.log()

  const result: MigrationResult = {
    imported: 0,
    linked: 0,
    skipped: 0,
    failed: 0,
    failures: [],
  }

  const totalBatches = Math.ceil(usersToMigrate.length / BATCH_SIZE)

  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    const start = batchIndex * BATCH_SIZE
    const end = Math.min(start + BATCH_SIZE, usersToMigrate.length)
    const batch = usersToMigrate.slice(start, end)

    console.log(`--- Batch ${batchIndex + 1}/${totalBatches} (users ${start + 1}–${end} of ${usersToMigrate.length}) ---`)

    for (const user of batch) {
      await migrateUser(user, result)
    }

    if (batchIndex < totalBatches - 1) {
      console.log(`  Waiting ${RATE_LIMIT_DELAY_MS / 1000}s before next batch...`)
      await sleep(RATE_LIMIT_DELAY_MS)
    }
  }

  console.log()
  console.log('=== Migration Summary ===')
  console.log(`Imported (new Clerk user):  ${result.imported}`)
  console.log(`Linked (existing in Clerk): ${result.linked}`)
  console.log(`Skipped (dry run):          ${result.skipped}`)
  console.log(`Failed:                     ${result.failed}`)

  if (result.failures.length > 0) {
    console.log()
    console.log('=== Failures ===')
    for (const f of result.failures) {
      console.log(`  User #${f.userId} (${f.email}): ${f.error}`)
    }
  }

  console.log()
  console.log('=== Verification ===')
  const finalWithClerkId = await prisma.user.count({ where: { clerkId: { not: null } } })
  const finalWithoutClerkId = await prisma.user.count({ where: { clerkId: null } })
  const finalTotal = await prisma.user.count()

  console.log(`Total users:        ${finalTotal}`)
  console.log(`With clerkId:       ${finalWithClerkId}`)
  console.log(`Without clerkId:    ${finalWithoutClerkId}`)
  console.log(`Migration coverage: ${((finalWithClerkId / finalTotal) * 100).toFixed(1)}%`)

  if (result.failed > 0) {
    console.log()
    console.log(`WARNING: ${result.failed} user(s) failed to migrate. Re-run the script to retry them.`)
    process.exitCode = 1
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error('Unhandled error:', e)
    await prisma.$disconnect()
    process.exit(1)
  })
