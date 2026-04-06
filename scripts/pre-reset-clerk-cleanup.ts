import { createClerkClient } from '@clerk/backend'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const main = async () => {
  const secretKey = process.env.CLERK_SECRET_KEY
  if (!secretKey) {
    console.log('[pre-reset] No CLERK_SECRET_KEY — skipping Clerk cleanup')
    return
  }

  const clerk = createClerkClient({ secretKey })
  await deleteEphemeralClerkUsers(prisma, clerk, 'pre-reset')
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
