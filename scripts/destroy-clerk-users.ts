import { PrismaClient } from '@prisma/client'
import { createClerkClient } from '@clerk/backend'
import { deleteEphemeralClerkUsers } from './util/clerk-cleanup.util'

const prisma = new PrismaClient()

const main = async () => {
  const secretKey = process.env.CLERK_SECRET_KEY
  if (!secretKey) {
    console.log(
      '[destroy] No CLERK_SECRET_KEY — skipping Clerk cleanup',
    )
    return
  }

  const clerk = createClerkClient({ secretKey })
  const { failed } = await deleteEphemeralClerkUsers(
    prisma,
    clerk,
    'destroy',
  )

  if (failed > 0) {
    process.exitCode = 1
  }
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
