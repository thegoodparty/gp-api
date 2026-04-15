import 'dotenv/config'
import { createHash } from 'node:crypto'
import { Prisma, PrismaClient } from '@prisma/client'
import { createClerkClient } from '@clerk/backend'
import { HttpStatus } from '@nestjs/common'
import { intervalToDuration } from 'date-fns'
import { genSaltSync, hashSync } from 'bcrypt'

const ADVISORY_LOCK_ID = createHash('md5')
  .update('clerk-user-migration')
  .digest()
  .readInt32BE(0)
const MAX_ATTEMPTS = 3
const RETRY_DELAY_MS = 10_000
const POLL_INTERVAL_MS = 10_000
const DEV_QA_USER_LIMIT = 1000
const CLERK_ERROR_FORM_EXISTS = 'form_identifier_exists'
const DRY_RUN = process.argv.includes('--dry-run')

const {
  CLERK_SECRET_KEY,
  CLERK_PUBLISHABLE_KEY,
  OTEL_SERVICE_ENVIRONMENT,
  SLACK_APP_ID,
  SLACK_BOT_DEV_CHANNEL_ID,
  SLACK_BOT_DEV_CHANNEL_TOKEN,
} = process.env

const VALID_ENVIRONMENTS = ['preview', 'dev', 'qa', 'prod']
if (
  !OTEL_SERVICE_ENVIRONMENT ||
  !VALID_ENVIRONMENTS.includes(OTEL_SERVICE_ENVIRONMENT)
) {
  console.error(
    `ERROR: OTEL_SERVICE_ENVIRONMENT must be one of: ${VALID_ENVIRONMENTS.join(', ')}. Got: "${OTEL_SERVICE_ENVIRONMENT ?? ''}"`,
  )
  process.exit(1)
}
if (!CLERK_SECRET_KEY) {
  console.error('ERROR: CLERK_SECRET_KEY env var is required')
  process.exit(1)
}
if (!CLERK_PUBLISHABLE_KEY) {
  console.error('ERROR: CLERK_PUBLISHABLE_KEY env var is required')
  process.exit(1)
}

const environment = OTEL_SERVICE_ENVIRONMENT
const isProd = environment === 'prod'
const CONCURRENCY = isProd ? 9 : 1

const prisma = new PrismaClient()
const clerk = createClerkClient({
  secretKey: CLERK_SECRET_KEY,
  publishableKey: CLERK_PUBLISHABLE_KEY,
})

interface MigrationResult {
  imported: number
  linked: number
  skipped: number
  ghosted: number
  failed: number
  avatarsUploaded: number
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
  avatar: string | null
}

interface ClerkApiErrorItem {
  code: string
  message: string
  longMessage?: string
}

interface ClerkApiError {
  errors: ClerkApiErrorItem[]
  status?: number
}

interface AdvisoryLockRow {
  locked: boolean
}

interface SlackBlock {
  type: string
  text?: { type: string; text: string }
}

interface SlackMessage {
  text: string
  blocks: SlackBlock[]
}

const NO_CLERK_ID = { clerkId: null }
const HAS_CLERK_ID = {
  clerkId: { not: null },
} satisfies Prisma.UserWhereInput

const BCRYPT_HASH_REGEX = /^\$2[aby]\$.{56}$/

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

const ensureBcryptHash = (password: string): string =>
  BCRYPT_HASH_REGEX.test(password)
    ? password
    : hashSync(password.trim(), genSaltSync())

const formatDuration = (ms: number): string => {
  const { minutes = 0, seconds = 0 } = intervalToDuration({
    start: 0,
    end: ms,
  })
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`
}

const isClerkApiError = (error: unknown): error is ClerkApiError => {
  if (typeof error !== 'object' || error === null || !('errors' in error)) {
    return false
  }
  const { errors } = error
  return Array.isArray(errors) && errors.length > 0
}

const isRateLimited = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null) {
    return false
  }
  if (
    'status' in error &&
    error.status === Number(HttpStatus.TOO_MANY_REQUESTS)
  ) {
    return true
  }
  return (
    isClerkApiError(error) &&
    error.errors.some((e) => e.code.includes('rate_limit'))
  )
}

const getClerkErrorCode = (error: unknown): string | undefined =>
  isClerkApiError(error) ? error.errors[0]?.code : undefined

const getClerkErrorMessage = (error: unknown): string => {
  if (isClerkApiError(error)) {
    const first = error.errors[0]
    return first?.longMessage ?? first?.message ?? 'Unknown Clerk error'
  }
  return error instanceof Error ? error.message : String(error)
}

const withRetry = async <T>(fn: () => Promise<T>): Promise<T> => {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await fn()
    } catch (error) {
      if (isRateLimited(error) && attempt < MAX_ATTEMPTS - 1) {
        console.log(
          `  Rate limited. Waiting 10s (retry ${attempt + 1}/${MAX_ATTEMPTS})...`,
        )
        await sleep(RETRY_DELAY_MS)
        continue
      }
      throw error
    }
  }
  throw new Error('withRetry: max retries exceeded')
}

const recordFailure = (
  result: MigrationResult,
  user: MigrationUser,
  email: string,
  error: string,
) => {
  result.failed++
  result.failures.push({
    userId: user.id,
    email,
    error,
  })
  console.error(`  [FAIL] User #${user.id} (${email}): ${error}`)
}

const acquireAdvisoryLock = async (): Promise<boolean> => {
  const rows = await prisma.$queryRaw<AdvisoryLockRow[]>`
        SELECT pg_try_advisory_lock(
          ${ADVISORY_LOCK_ID}
        ) as locked
      `
  return rows[0]?.locked ?? false
}

const uploadAvatar = async (
  clerkUserId: string,
  avatarUrl: string,
  result: MigrationResult,
): Promise<void> => {
  try {
    const response = await fetch(avatarUrl)
    if (!response.ok) {
      console.error(
        `  [AVATAR SKIP] Download failed: ${response.status} for ${avatarUrl}`,
      )
      return
    }
    const blob = await response.blob()
    await withRetry(() =>
      clerk.users.updateUserProfileImage(clerkUserId, {
        file: blob,
      }),
    )
    result.avatarsUploaded++
  } catch (error) {
    console.error(
      `  [AVATAR FAIL] ${clerkUserId}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

const handleDuplicateUser = async (
  user: MigrationUser,
  email: string,
  result: MigrationResult,
): Promise<void> => {
  try {
    const existing = await withRetry(() =>
      clerk.users.getUserList({
        emailAddress: [email],
      }),
    )

    if (existing.data.length > 0) {
      const clerkUser = existing.data[0]

      await prisma.user.update({
        where: { id: user.id },
        data: { clerkId: clerkUser.id },
      })

      result.linked++
      console.log(
        `  [LINKED] User #${user.id} (${email}) → existing Clerk user ${clerkUser.id}`,
      )

      if (user.avatar) {
        await uploadAvatar(clerkUser.id, user.avatar, result)
      }
    } else {
      result.ghosted++
      console.log(
        `  [GHOST] User #${user.id} (${email}): email claimed in Clerk but user not found`,
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

const migrateUser = async (
  user: MigrationUser,
  result: MigrationResult,
): Promise<void> => {
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

    const params = user.password
      ? {
          ...baseParams,
          passwordDigest: ensureBcryptHash(user.password),
          passwordHasher: 'bcrypt' as const,
          skipPasswordChecks: true,
        }
      : {
          ...baseParams,
          skipPasswordRequirement: true,
        }

    const clerkUser = await withRetry(() => clerk.users.createUser(params))

    await prisma.user.update({
      where: { id: user.id },
      data: { clerkId: clerkUser.id },
    })

    result.imported++
    console.log(`  [OK] User #${user.id} (${email}) → ${clerkUser.id}`)

    if (user.avatar) {
      await uploadAvatar(clerkUser.id, user.avatar, result)
    }
  } catch (error) {
    const errorCode = getClerkErrorCode(error)

    if (errorCode === CLERK_ERROR_FORM_EXISTS) {
      await handleDuplicateUser(user, email, result)
    } else {
      recordFailure(result, user, email, getClerkErrorMessage(error))
    }
  }
}

const fetchUsers = (): Promise<MigrationUser[]> =>
  isProd
    ? prisma.user.findMany({
        where: NO_CLERK_ID,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          password: true,
          avatar: true,
        },
        orderBy: { id: Prisma.SortOrder.asc },
      })
    : // Raw query required: Prisma doesn't support orderBy on JSON column values
      prisma.$queryRaw<MigrationUser[]>`
        SELECT
          id,
          email,
          first_name AS "firstName",
          last_name AS "lastName",
          password,
          avatar
        FROM "user"
        WHERE clerk_id IS NULL
        ORDER BY
          meta_data->>'lastVisited' DESC NULLS LAST
        LIMIT ${DEV_QA_USER_LIMIT}
      `

const buildSlackMessage = (
  result: MigrationResult,
  durationMs: number,
  totalInDb: number,
  userLimit: number | undefined,
): SlackMessage => {
  const hasFailures = result.failed > 0
  const header = hasFailures
    ? ':warning: *Clerk User Migration Completed with Errors*'
    : ':white_check_mark: *Clerk User Migration Complete*'

  const mode = userLimit
    ? `Last ${userLimit.toLocaleString()} users by \`lastVisited\` (${totalInDb.toLocaleString()} total in DB)`
    : 'All users'

  const lines = [
    header,
    '',
    `*Environment:* ${environment.toUpperCase()}`,
    `*Duration:* ${formatDuration(durationMs)}`,
    `*Mode:* ${mode}`,
    '',
    `:bust_in_silhouette: *${result.imported.toLocaleString()}* created`,
    `:link: *${result.linked.toLocaleString()}* linked (already in Clerk)`,
    `:frame_with_picture: *${result.avatarsUploaded.toLocaleString()}* avatars uploaded`,
    `:fast_forward: *${result.skipped.toLocaleString()}* skipped`,
    `:ghost: *${result.ghosted.toLocaleString()}* ghosted (orphaned email in Clerk)`,
    `:x: *${result.failed.toLocaleString()}* failed`,
  ]

  if (hasFailures) {
    lines.push(
      '',
      `:rotating_light: *${result.failed} users failed* — re-deploy to retry.`,
    )
  }

  const text = lines.join('\n')

  return {
    text,
    blocks: [
      {
        type: 'section',
        text: { type: 'mrkdwn', text },
      },
    ],
  }
}

const sendSlackReport = async (message: SlackMessage): Promise<void> => {
  if (
    !SLACK_APP_ID ||
    !SLACK_BOT_DEV_CHANNEL_ID ||
    !SLACK_BOT_DEV_CHANNEL_TOKEN
  ) {
    console.log('WARNING: Slack env vars not set, skipping report.')
    return
  }

  try {
    const url = `https://hooks.slack.com/services/${SLACK_APP_ID}/${SLACK_BOT_DEV_CHANNEL_ID}/${SLACK_BOT_DEV_CHANNEL_TOKEN}`
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    })
    if (!response.ok) {
      console.error(
        `Slack report failed: ${response.status} ${response.statusText}`,
      )
    }
  } catch (error) {
    console.error(
      'Slack report failed:',
      error instanceof Error ? error.message : String(error),
    )
  }
}

const main = async () => {
  const startTime = Date.now()

  console.log('=== Clerk User Migration ===')
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`)
  console.log(`Environment: ${environment}`)
  console.log(`Instance: ${isProd ? 'production' : 'development'}`)
  console.log(`Concurrency: ${CONCURRENCY}`)
  if (!isProd) {
    console.log(`User limit: ${DEV_QA_USER_LIMIT} (most recent by lastVisited)`)
  }
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

  let lockAcquired = await acquireAdvisoryLock()
  if (!lockAcquired) {
    console.log('Another instance is running migration. Waiting...')
    while (!lockAcquired) {
      await sleep(POLL_INTERVAL_MS)
      lockAcquired = await acquireAdvisoryLock()
      if (!lockAcquired) {
        console.log('  Still waiting for other instance...')
      }
    }
    console.log('Lock acquired. Checking remaining work...')
  }

  const users = await fetchUsers()

  if (users.length === 0) {
    console.log('No users to migrate.')
    return
  }

  const userLimit = isProd ? undefined : DEV_QA_USER_LIMIT

  console.log(`Fetched ${users.length} users to process.`)
  console.log()

  const result: MigrationResult = {
    imported: 0,
    linked: 0,
    skipped: 0,
    ghosted: 0,
    failed: 0,
    avatarsUploaded: 0,
    failures: [],
  }

  const totalBatches = Math.ceil(users.length / CONCURRENCY)

  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    const start = batchIndex * CONCURRENCY
    const end = Math.min(start + CONCURRENCY, users.length)
    const batch = users.slice(start, end)

    console.log(
      `--- Batch ${batchIndex + 1}/${totalBatches} (users ${start + 1}–${end} of ${users.length}) ---`,
    )

    await Promise.all(batch.map((user) => migrateUser(user, result)))
  }

  console.log()
  console.log('=== Migration Summary ===')
  console.log(`Imported (new Clerk user):  ${result.imported}`)
  console.log(`Linked (existing in Clerk): ${result.linked}`)
  console.log(`Avatars uploaded:           ${result.avatarsUploaded}`)
  console.log(`Skipped (dry run):          ${result.skipped}`)
  console.log(`Ghosted (orphaned email):   ${result.ghosted}`)
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

  const durationMs = Date.now() - startTime

  const slackMessage = buildSlackMessage(
    result,
    durationMs,
    totalUsers,
    userLimit,
  )
  await sendSlackReport(slackMessage)

  if (result.ghosted > 0) {
    console.log()
    console.log(
      `NOTE: ${result.ghosted} user(s) have orphaned emails in Clerk (deleted users still claiming the email). Contact Clerk support to release them.`,
    )
  }

  if (result.failed > 0) {
    console.log()
    console.log(
      `WARNING: ${result.failed} user(s) failed. Re-run the script to retry them.`,
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
