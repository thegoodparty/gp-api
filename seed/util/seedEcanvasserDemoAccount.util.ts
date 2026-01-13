// TODO: move this to a secrets store somewhere
import { PrismaClient } from '@prisma/client'
import { ecanvasserFactory } from '../factories/ecanvasser.factory'
import { ADMIN_USER } from '../users'

const DEMO_ECANVASSER_API_KEY =
  'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJhdWQiOiIxMyIsImp0aSI6IjIyYTQ1ZDA1YTc4OGVjNjIxNDBhOWI0YjA3NjE2NmYwZDgwYjMwYzBmNGJjYzY0NDc3OTZiZTZjNGVhY2EyMjQ5OGU1MzNlZjMzZDllZTJkIiwiaWF0IjoxNzQyNDE3NDc0Ljk4NTM1NSwibmJmIjoxNzQyNDE3NDc0Ljk4NTM1OCwiZXhwIjoxNzczOTUzNDczLjk2OTc4Miwic3ViIjoiNTQ0NTMyIiwic2NvcGVzIjpbXX0.p337PK6izmgkhR8zmK2tIAxLYV5B43dVPV6RMclhPSZnnLiKcEYyAOtf4tGGgTfgi6Kciss-aipF79DT9zumYAGARKHY_v8dUNMjEFXo3mYPmVAK-safe-BP3XA3YSsrK3QVLXo2IBVKBq-rE6yMOSk-po1jS-5WSb2MC7sco_CTTODlSvr-nlEMitWGrDtMuyZUeI_YdFPAVrPOFNq8311mVVwAa2zISTzee0rKVHOhe46wR_xour02OGVUZWxbaDoEiJMFAHEUcbe04fZvliPCySXhH51dYBsG4mfqaQzyq9pstaksQdx_qsGksoKJ2Z6bnC87tdsxanOiK_DR5dB3efDkj0M_KYHhg-VY4C2R-ZWQKbaAFLCDXsEhO_GdJIBxhHy9HS_X7f8xRC2-e1QBpA43K4QeWVDjOD8rwg4uwHOQ9SKAEPvwYUMISxZeSEmPquKFvWqjwZEZz_rCD9y9nE58WtxjV_RQfZWoD9KJNYX2be9PnJptjD9j4yTTnKVO9cp5nu18S7H3DOSHJG3W-PC-lQX1WWJ2Fck8QSZWNOGZtG7nHWeAkUq2yFFczI3iPlQkD4cGtVrOL3iNzOm3aM_TCHk_sjA44AOY-32BwsPR2MRHImnhNz2NduqPmuGlhyYNg7Fc8bfiy3jIecYW3fte3rlnYrs7hcVMkZQ'
export const seedEcanvasserDemoAccount = async (
  userEmail: string,
  prisma: PrismaClient,
) => {
  const user = await prisma.user.findUnique({
    where: { email: userEmail },
  })
  if (!user) {
    throw new Error(`User with email ${ADMIN_USER.email} not found`)
  }

  const campaign = await prisma.campaign.findFirstOrThrow({
    where: { userId: user.id },
  })

  if (!campaign) {
    throw new Error(
      `Campaign not found for user with email ${ADMIN_USER.email}`,
    )
  }
  return prisma.ecanvasser.create({
    data: ecanvasserFactory({
      campaignId: campaign.id,
      apiKey: DEMO_ECANVASSER_API_KEY,
    }),
  })
}
