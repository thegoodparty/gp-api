import retry from 'async-retry'

type RetryIfOptions = {
  shouldRetry: (error: unknown) => boolean
}

export const retryIf = <Result>(
  fn: retry.RetryFunction<Result>,
  { shouldRetry, ...options }: retry.Options & RetryIfOptions,
): Promise<Result> =>
  retry(async (bail, attempt) => {
    try {
      return await fn(bail, attempt)
    } catch (error) {
      if (!shouldRetry(error) && error && typeof error === 'object') {
        Object.defineProperty(error, 'bail', {
          value: true,
          configurable: true,
        })
      }
      throw error
    }
  }, options)
