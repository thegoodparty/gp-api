import { UnauthorizedException } from '@nestjs/common'
import { ClerkClient } from '@clerk/backend'

const { GP_WEBAPP_MACHINE_SECRET } = process.env

if (!GP_WEBAPP_MACHINE_SECRET)
  throw new Error(
    'GP_WEBAPP_MACHINE_SECRET must be set in the environment variables',
  )

export const verifyM2MToken = async (
  token: string,
  clerkClient: ClerkClient,
) => {
  try {
    return await clerkClient.m2m.verify({
      token,
      machineSecretKey: GP_WEBAPP_MACHINE_SECRET,
    })
  } catch (error) {
    throw new UnauthorizedException('M2M token verification failed')
  }
}
