import Bottleneck from 'bottleneck'

type ThrottleConfig = {
  rateLimit: number
  windowMs: number
  workerCount?: number
  safetyFactor?: number
  maxRetries?: number
  label?: string
}

type RateLimitError = Error & { status?: number; retryAfter?: number }

const is429 = (error: RateLimitError): boolean =>
  error.status === 429 || error.message.includes('Too Many Requests')

export const throttleRequestsWithRetry = (
  config: ThrottleConfig,
): (<T>(fn: () => Promise<T>, weight?: number) => Promise<T>) => {
  const {
    rateLimit,
    windowMs,
    workerCount = 1,
    safetyFactor = 0.5,
    maxRetries = 3,
    label = 'throttle',
  } = config

  const perWorkerLimit = Math.floor((rateLimit * safetyFactor) / workerCount)
  const minTimeMs = Math.ceil(windowMs / perWorkerLimit)

  const limiter = new Bottleneck({
    reservoir: perWorkerLimit,
    reservoirRefreshAmount: perWorkerLimit,
    reservoirRefreshInterval: windowMs,
    maxConcurrent: null,
    minTime: minTimeMs,
  })

  limiter.on(
    'failed',
    async (error: RateLimitError, jobInfo): Promise<number | void> => {
      if (jobInfo.retryCount < maxRetries && is429(error)) {
        const retryAfter = error.retryAfter || 1
        const waitMs = retryAfter * 1000
        console.log(
          `[${label}] 429 hit — attempt ` +
            `${jobInfo.retryCount + 1}/${maxRetries}, ` +
            `waiting ${retryAfter}s`,
        )
        return waitMs
      }

      return undefined
    },
  )

  return <T>(fn: () => Promise<T>, weight?: number): Promise<T> =>
    limiter.schedule({ weight: weight ?? 1 }, fn)
}
