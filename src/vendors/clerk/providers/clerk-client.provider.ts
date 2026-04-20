import { createClerkClient } from '@clerk/backend'

const { CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY } = process.env

if (!CLERK_PUBLISHABLE_KEY || !CLERK_SECRET_KEY) {
  throw new Error('CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY must be set!')
}

export const CLERK_CLIENT_PROVIDER_TOKEN = 'ClerkClient'

export const ClerkClientProvider = {
  provide: CLERK_CLIENT_PROVIDER_TOKEN,
  useFactory: () =>
    createClerkClient({
      publishableKey: CLERK_PUBLISHABLE_KEY,
      secretKey: CLERK_SECRET_KEY,
    }),
}
