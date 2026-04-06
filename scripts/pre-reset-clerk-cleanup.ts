import { PrismaClient } from '@prisma/client'
import { createClerkClient } from '@clerk/backend'
import pmap from 'p-map'
import { FIXED_EMAILS } from '../seed/users'
import { clerkThrottle } from '../seed/util/clerkThrottle.util'

const prisma = new PrismaClient()

const main = async () => {
  const secretKey = process.env.CLERK_SECRET_KEY
  if (!secretKey) {
    console.log(
      '[pre-reset] No CLERK_SECRET_KEY — skipping Clerk cleanup',
    )
    return
  }

  const clerk = createClerkClient({ secretKey })

  const usersWithClerkId = await prisma.user.findMany({
    where: { clerkId: { not: null } },
    select: { clerkId: true, email: true },
  })

  const clerkIds = usersWithClerkId
    .filter((u) => !FIXED_EMAILS.has(u.email))
    .map((u) => u.clerkId)
    .filter((id): id is string => id !== null)

  if (clerkIds.length === 0) {
    console.log('[pre-reset] No Clerk users to clean up')
    return
  }

  console.log(
    `[pre-reset] Deleting ${clerkIds.length} Clerk user(s) (preserving ${usersWithClerkId.length - clerkIds.length} fixed)...`,
  )

  let deleted = 0
  await pmap(
    clerkIds,
    async (id) => {
      try {
        await clerkThrottle(() => clerk.users.deleteUser(id))
        deleted++
      } catch (err) {
        const message =
          err instanceof Error ? err.message : String(err)
        console.error(
          `[pre-reset] Failed to delete ${id}: ${message}`,
        )
      }
    },
  )

  console.log(
    `[pre-reset] Deleted ${deleted}/${clerkIds.length} Clerk user(s)`,
  )
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
