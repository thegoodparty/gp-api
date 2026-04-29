import { throttleRequestsWithRetry } from './throttleRequestsWithRetry.util'

// https://clerk.com/docs/guides/how-clerk-works/system-limits#backend-api-requests
const CLERK_DEV_RATE_LIMIT = 100
const CLERK_RATE_WINDOW_MS = 10_000

export const clerkThrottle = throttleRequestsWithRetry({
  rateLimit: CLERK_DEV_RATE_LIMIT,
  windowMs: CLERK_RATE_WINDOW_MS,
  workerCount: 1,
  safetyFactor: 0.5,
  maxRetries: 3,
  label: 'clerk-api',
})
