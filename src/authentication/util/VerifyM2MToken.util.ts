import { UnauthorizedException } from '@nestjs/common'
import { ClerkClient } from '@clerk/backend'

export const { GP_WEBAPP_MACHINE_SECRET } = process.env

if (!GP_WEBAPP_MACHINE_SECRET)
  throw new Error(
    'CLERK_SECRET_KEY and GP_WEBAPP_MACHINE_SECRET must be set in the environment variables',
  )

export const verifyM2MToken = async (
  token: string,
  clerkClient: ClerkClient,
) => {
  try {
    // Verify M2M token using your NestJS machine's secret
    return await clerkClient.m2m.verify({
      token,
      machineSecretKey: GP_WEBAPP_MACHINE_SECRET,
    })
  } catch (error) {
    console.dir(error, { depth: 4, colors: true })
    console.error(error instanceof Error ? error.message : 'Unknown error')
    throw new UnauthorizedException('Invalid M2M token')
  }
}
