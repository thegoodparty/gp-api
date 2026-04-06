import { PrismaClient } from '@prisma/client'
import { createClerkClient } from '@clerk/backend'
import pmap from 'p-map'
import { FIXED_EMAILS } from '../../seed/users'
import {
  clerkRetry,
  CLERK_CONCURRENCY,
} from '../../seed/util/clerkRetry.util'

export interface ClerkCleanupResult {
  deleted: number
  failed: number
  total: number
  preserved: number
}

export async function deleteEphemeralClerkUsers(
  prisma: PrismaClient,
  clerk: ReturnType<typeof createClerkClient>,
  prefix: string,
): Promise<ClerkCleanupResult> {
  const usersWithClerkId = await prisma.user.findMany({
    where: { clerkId: { not: null } },
    select: { clerkId: true, email: true },
  })

  const clerkIds = usersWithClerkId
    .filter((u) => !FIXED_EMAILS.has(u.email))
    .map((u) => u.clerkId)
    .filter((id): id is string => id !== null)

  const preserved = usersWithClerkId.length - clerkIds.length

  if (clerkIds.length === 0) {
    console.log(`[${prefix}] No Clerk users to clean up`)
    return { deleted: 0, failed: 0, total: 0, preserved }
  }

  console.log(
    `[${prefix}] Deleting ${clerkIds.length} Clerk user(s) (preserving ${preserved} fixed)...`,
  )

  let deleted = 0
  let failed = 0

  await pmap(
    clerkIds,
    async (id) => {
      try {
        await clerkRetry(() => clerk.users.deleteUser(id))
        deleted++
      } catch (err) {
        const message =
          err instanceof Error ? err.message : String(err)
        console.error(`[${prefix}] Failed to delete ${id}: ${message}`)
        failed++
      }
    },
    { concurrency: CLERK_CONCURRENCY },
  )

  console.log(
    `[${prefix}] Deleted ${deleted}/${clerkIds.length} Clerk user(s)`,
  )

  return { deleted, failed, total: clerkIds.length, preserved }
}
