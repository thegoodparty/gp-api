import { PrismaClient } from '@prisma/client'
import { createClerkClient } from '@clerk/backend'

const CLERK_ERROR_FORM_EXISTS = 'form_identifier_exists'

function getArgValue(prefix: string, fallback: string): string {
  return (
    process.argv.find((a) => a.startsWith(prefix))?.split('=')[1] ?? fallback
  )
}

const BATCH_SIZE = parseInt(getArgValue('--batch-size=', '50'), 10)
const RATE_LIMIT_DELAY_MS = 3_000
const DRY_RUN = process.argv.includes('--dry-run')
const LIMIT = parseInt(getArgValue('--limit=', '0'), 10) || undefined

const { CLERK_SECRET_KEY, CLERK_PUBLISHABLE_KEY } = process.env

if (!CLERK_SECRET_KEY) {
  console.error('ERROR: CLERK_SECRET_KEY env var is required')
  process.exit(1)
}
if (!CLERK_PUBLISHABLE_KEY) {
  console.error('ERROR: CLERK_PUBLISHABLE_KEY env var is required')
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
  failures: {
    userId: number
    email: string
    error: string
  }[]
}

interface MigrationUser {
  id: number
  email: string
  firstName: string | null
  lastName: string | null
  password: string | null
  hasPassword: boolean
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

function recordFailure(
  result: MigrationResult,
  user: MigrationUser,
  email: string,
  error: string,
) {
  result.failed++
  result.failures.push({ userId: user.id, email, error })
  console.error(`  [FAIL] User #${user.id} (${email}): ${error}`)
}

async function migrateUser(
  user: MigrationUser,
  result: MigrationResult,
): Promise<void> {
  const email = user.email.trim().toLowerCase()

  if (DRY_RUN) {
    console.log(`  [DRY RUN] Would migrate user #${user.id} (${email})`)
    result.skipped++
    return
  }

  try {
    const baseParams = {
      emailAddress: [email],
      firstName: user.firstName || undefined,
      lastName: user.lastName || undefined,
      skipLegalChecks: true,
      externalId: String(user.id),
    }

    const params =
      user.hasPassword && user.password
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
    console.log(`  [OK] User #${user.id} (${email}) → ${clerkUser.id}`)
  } catch (error) {
    const errorCode = getClerkErrorCode(error)

    if (errorCode === CLERK_ERROR_FORM_EXISTS) {
      await handleDuplicateUser(user, email, result)
    } else {
      recordFailure(result, user, email, getClerkErrorMessage(error))
    }
  }
}

async function handleDuplicateUser(
  user: MigrationUser,
  email: string,
  result: MigrationResult,
) {
  try {
    const existing = await clerk.users.getUserList({
      emailAddress: [email],
    })

    if (existing.data.length > 0) {
      const clerkUser = existing.data[0]

      await prisma.user.update({
        where: { id: user.id },
        data: { clerkId: clerkUser.id },
      })

      result.linked++
      console.log(
        `  [LINKED] User #${user.id} (${email})` +
          ` → existing Clerk user ${clerkUser.id}`,
      )
    } else {
      recordFailure(
        result,
        user,
        email,
        'form_identifier_exists but lookup returned empty',
      )
    }
  } catch (lookupError) {
    recordFailure(
      result,
      user,
      email,
      `Duplicate handling failed: ${getClerkErrorMessage(lookupError)}`,
    )
  }
}

const HAS_CLERK_ID = { clerkId: { not: null } }
const NO_CLERK_ID = { clerkId: null }

async function main() {
  console.log('=== Clerk User Migration ===')
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`)
  console.log(`Batch size: ${BATCH_SIZE}`)
  if (LIMIT) console.log(`Limit: ${LIMIT} users`)
  console.log()

  const totalUsers = await prisma.user.count()
  const alreadyMigrated = await prisma.user.count({
    where: HAS_CLERK_ID,
  })
  const pending = await prisma.user.count({
    where: NO_CLERK_ID,
  })

  console.log(`Total users in database:    ${totalUsers}`)
  console.log(`Already migrated (clerkId): ${alreadyMigrated}`)
  console.log(`Pending migration:          ${pending}`)
  console.log()

  if (pending === 0) {
    console.log('All users already have a clerkId.')
    return
  }

  const users = await prisma.user.findMany({
    where: NO_CLERK_ID,
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

  console.log(`Fetched ${users.length} users to process.`)
  console.log()

  const result: MigrationResult = {
    imported: 0,
    linked: 0,
    skipped: 0,
    failed: 0,
    failures: [],
  }

  const totalBatches = Math.ceil(users.length / BATCH_SIZE)

  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    const start = batchIndex * BATCH_SIZE
    const end = Math.min(start + BATCH_SIZE, users.length)
    const batch = users.slice(start, end)

    console.log(
      `--- Batch ${batchIndex + 1}/${totalBatches}` +
        ` (users ${start + 1}–${end}` +
        ` of ${users.length}) ---`,
    )

    for (const user of batch) {
      await migrateUser(user, result)
    }

    if (batchIndex < totalBatches - 1) {
      const delaySec = RATE_LIMIT_DELAY_MS / 1000
      console.log(`  Waiting ${delaySec}s before next batch...`)
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
  const finalWithClerkId = await prisma.user.count({
    where: HAS_CLERK_ID,
  })
  const finalWithoutClerkId = await prisma.user.count({
    where: NO_CLERK_ID,
  })
  const finalTotal = await prisma.user.count()

  console.log(`Total users:        ${finalTotal}`)
  console.log(`With clerkId:       ${finalWithClerkId}`)
  console.log(`Without clerkId:    ${finalWithoutClerkId}`)
  const coverage = ((finalWithClerkId / finalTotal) * 100).toFixed(1)
  console.log(`Migration coverage: ${coverage}%`)

  if (result.failed > 0) {
    console.log()
    console.log(
      `WARNING: ${result.failed} user(s) failed.` +
        ' Re-run the script to retry them.',
    )
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
