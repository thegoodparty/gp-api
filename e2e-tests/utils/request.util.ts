import { APIRequestContext, APIResponse } from '@playwright/test'

const RETRYABLE_PATTERNS = [
  'write conflict',
  'deadlock',
  'please retry your transaction',
]

function isRetryableResponse(status: number, body: string): boolean {
  if (status !== 400) return false
  const lower = body.toLowerCase()
  return RETRYABLE_PATTERNS.some((p) => lower.includes(p))
}

/**
 * Retries an API call when a Serializable-transaction deadlock (P2034)
 * causes a 400 "write conflict / deadlock" response. These are inherently
 * transient under parallel test execution.
 */
export async function retryOnConflict(
  fn: () => Promise<APIResponse>,
  opts?: { retries?: number; delay?: number },
): Promise<APIResponse> {
  const maxRetries = opts?.retries ?? 3
  const delay = opts?.delay ?? 200

  let lastResponse: APIResponse | undefined

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fn()
    lastResponse = response

    if (response.ok()) return response

    const body = await response.text()
    if (!isRetryableResponse(response.status(), body)) return response

    if (attempt < maxRetries) {
      const wait = delay * Math.pow(2, attempt)
      await new Promise((r) => setTimeout(r, wait))
    }
  }

  return lastResponse!
}

/**
 * PUT /v1/campaigns/mine with automatic deadlock retry.
 */
export async function updateCampaignWithRetry(
  request: APIRequestContext,
  token: string,
  data: Record<string, unknown>,
): Promise<APIResponse> {
  return retryOnConflict(() =>
    request.put('/v1/campaigns/mine', {
      headers: { Authorization: `Bearer ${token}` },
      data,
    }),
  )
}

/**
 * Assert that a response is OK, throwing with the response body for diagnostics.
 */
export async function assertResponseOk(
  response: APIResponse,
  label: string,
): Promise<void> {
  if (!response.ok()) {
    throw new Error(`${label}: ${response.status()} ${await response.text()}`)
  }
}
