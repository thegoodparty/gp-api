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
      const result = await fn(bail, attempt)
      return result
    } catch (error) {
      if (!shouldRetry(error)) {
        bail(error)
      }
      throw error
    }
  }, options)
