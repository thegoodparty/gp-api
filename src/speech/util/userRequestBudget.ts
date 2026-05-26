/**
 * In-memory sliding-window per-user request limiter.
 *
 * Used by the speech endpoints to bound per-user request rate against
 * AWS-billed surfaces (Polly synthesis, Transcribe sessions). Single-process
 * only — fine for v1 because: (a) load is small, (b) any per-pod overage is
 * still bounded by the same factor across pods, and (c) the AWS bill caps
 * are global, not per-pod. Replace with a Redis-backed limiter if/when the
 * speech feature scales beyond a single API instance for sustained bursts.
 *
 * Memory bound: at most one Map entry per active user, each holding at
 * most `limit` numeric timestamps. With the current limits below this is a
 * few KB per active user.
 */
export class UserRequestBudget {
  private readonly windowMs: number
  private readonly limit: number
  private readonly buckets: Map<number, number[]> = new Map()

  constructor(opts: { windowMs: number; limit: number }) {
    this.windowMs = opts.windowMs
    this.limit = opts.limit
  }

  /**
   * Records a single request for the given user. Returns true if the user
   * was within budget (and the request was admitted), false if they have
   * exceeded the budget for the current window.
   *
   * Callers should map a `false` return to a 429 response.
   */
  tryAdmit(userId: number): boolean {
    const now = Date.now()
    const cutoff = now - this.windowMs
    const existing = this.buckets.get(userId) ?? []
    const fresh = existing.filter((t) => t > cutoff)
    if (fresh.length >= this.limit) {
      this.buckets.set(userId, fresh)
      return false
    }
    fresh.push(now)
    this.buckets.set(userId, fresh)
    return true
  }
}
