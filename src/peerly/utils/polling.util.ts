import { Logger } from '@nestjs/common'

export interface PollingOptions {
  maxAttempts: number
  initialDelayMs: number
  maxDelayMs: number
  backoffMultiplier: number
}

export class PollingUtil {
  private static readonly logger = new Logger(PollingUtil.name)

  static async pollWithBackoff<T>(
    checkFn: () => Promise<T>,
    isCompleteFn: (result: T) => boolean,
    options: PollingOptions,
  ): Promise<T> {
    const { maxAttempts, initialDelayMs, maxDelayMs, backoffMultiplier } =
      options
    let attempt = 0
    let delayMs = initialDelayMs

    while (attempt < maxAttempts) {
      try {
        const result = await checkFn()
        if (isCompleteFn(result)) {
          return result
        }
      } catch (error) {
        this.logger.error(`Polling attempt ${attempt + 1} failed:`, error)
        if (attempt === maxAttempts - 1) {
          throw error
        }
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs))
      delayMs = Math.min(delayMs * backoffMultiplier, maxDelayMs)
      attempt++
    }

    throw new Error(`Polling failed after ${maxAttempts} attempts`)
  }
}
