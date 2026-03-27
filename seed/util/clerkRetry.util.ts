import retry from 'async-retry'

type ClerkRateLimitError = Error & {
  status: 429
  retryAfter: number
}

const isClerk429 = (
  error: unknown,
): error is ClerkRateLimitError =>
  typeof error === 'object' &&
  error !== null &&
  'status' in error &&
  (error as { status: number }).status === 429

export const CLERK_CONCURRENCY = 3

export const clerkRetry = <T>(
  fn: () => Promise<T>,
): Promise<T> =>
  retry(
    async (bail) => {
      try {
        return await fn()
      } catch (error) {
        if (isClerk429(error)) {
          const waitMs = (error.retryAfter ?? 10) * 1_000
          console.log(
            `  [CLERK] Rate limited — waiting ${waitMs / 1_000}s before retry…`,
          )
          await new Promise((resolve) =>
            setTimeout(resolve, waitMs),
          )
          throw error
        }
        bail(
          error instanceof Error
            ? error
            : new Error(String(error)),
        )
        return undefined as never
      }
    },
    { retries: 4, minTimeout: 0, maxTimeout: 0 },
  )
