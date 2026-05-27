import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common'
import type { FastifyRequest } from 'fastify'

/**
 * In-memory per-IP token bucket for the public `/v1/briefings/:uuid` endpoint.
 *
 * The endpoint is unauthenticated and the UUID acts as a bearer token, so
 * the obvious attack is to scrape valid IDs by spraying guesses. This guard
 * keeps a tiny token-bucket per remote IP, refusing requests beyond the
 * burst + refill window.
 *
 * This is a *stopgap*: the in-memory map doesn't share across gp-api
 * instances and `request.ip` is only meaningful when fastify is configured
 * with `trustProxy` so the upstream load balancer's `X-Forwarded-For` is
 * respected. The right long-term answer is (a) Vercel/Cloudflare WAF rules
 * on `goodparty.org/api/v1/briefings/*`, and/or (b) replacing the UUID with
 * a signed/expiring share token stored in `share_tokens`. Track that in
 * follow-up before scaling shares to large volumes.
 *
 * Memory bound: an IP-rotating attacker would otherwise grow `buckets`
 * indefinitely. We mitigate via two complementary mechanisms:
 *   1. Opportunistic sweep — every `SWEEP_INTERVAL_MS` we drop any bucket
 *      that has refilled to full *and* hasn't been touched in `IDLE_TTL_MS`.
 *      Active clients keep their bucket; idle clients eventually GC.
 *   2. Hard ceiling — if the map ever exceeds `MAX_BUCKETS`, we forcibly
 *      evict the 10% oldest by `lastRefillMs`. This bounds worst-case
 *      memory regardless of how aggressively IPs are rotated.
 */
@Injectable()
export class BriefingsPdfRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(BriefingsPdfRateLimitGuard.name)

  // 30 requests per 60s, with a burst of 10. Numbers picked to leave plenty
  // of headroom for legitimate "click the link, refresh, share with team"
  // patterns while shutting down random-UUID enumeration quickly.
  private readonly capacity = 30
  private readonly refillPerMs = 30 / 60_000

  // Memory-bound tunables. See class docstring for the strategy.
  private static readonly MAX_BUCKETS = 10_000
  private static readonly IDLE_TTL_MS = 5 * 60_000 // 5 min
  private static readonly SWEEP_INTERVAL_MS = 60_000 // 1 min
  private static readonly FORCED_EVICTION_FRACTION = 0.1

  private readonly buckets = new Map<
    string,
    { tokens: number; lastRefillMs: number }
  >()
  private lastSweepMs = 0

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<FastifyRequest>()
    const ip = (req.ip ?? 'unknown').toString()
    const now = Date.now()

    // Run housekeeping before the per-IP work so transient memory spikes
    // are bounded even under bursty traffic.
    this.maybeSweep(now)

    const bucket = this.buckets.get(ip) ?? {
      tokens: this.capacity,
      lastRefillMs: now,
    }

    bucket.tokens = Math.min(
      this.capacity,
      bucket.tokens + (now - bucket.lastRefillMs) * this.refillPerMs,
    )
    bucket.lastRefillMs = now

    if (bucket.tokens < 1) {
      this.logger.warn(
        `Rate limit hit on /v1/briefings/:uuid from ${ip}; refusing further requests until refill.`,
      )
      this.buckets.set(ip, bucket)
      throw new HttpException('Too Many Requests', HttpStatus.TOO_MANY_REQUESTS)
    }

    bucket.tokens -= 1
    this.buckets.set(ip, bucket)
    return true
  }

  private maybeSweep(now: number): void {
    if (
      now - this.lastSweepMs >=
      BriefingsPdfRateLimitGuard.SWEEP_INTERVAL_MS
    ) {
      this.lastSweepMs = now
      this.sweepIdleBuckets(now)
    }
    if (this.buckets.size > BriefingsPdfRateLimitGuard.MAX_BUCKETS) {
      this.forceEvictOldest()
    }
  }

  /**
   * Drop any bucket that hasn't been touched in `IDLE_TTL_MS`. Given the
   * refill rate (full capacity in 60s) and the idle TTL (5 min), an idle
   * bucket has unconditionally refilled to full long before being swept,
   * so the next request from that IP starts in exactly the same state
   * regardless of whether we kept or dropped the old entry.
   */
  private sweepIdleBuckets(now: number): void {
    let removed = 0
    for (const [ip, bucket] of this.buckets) {
      if (now - bucket.lastRefillMs >= BriefingsPdfRateLimitGuard.IDLE_TTL_MS) {
        this.buckets.delete(ip)
        removed++
      }
    }
    if (removed > 0) {
      this.logger.debug(
        `Rate-limit sweep removed ${removed} idle buckets (size now ${this.buckets.size}).`,
      )
    }
  }

  /**
   * Emergency cap: if an attacker rotates IPs fast enough to exceed
   * `MAX_BUCKETS`, drop the oldest `FORCED_EVICTION_FRACTION` of entries
   * to free space. Dropped clients start over with a fresh bucket — that's
   * a soft-reset rather than a permission, since legitimate users virtually
   * never run into this branch.
   */
  private forceEvictOldest(): void {
    const target = Math.floor(
      BriefingsPdfRateLimitGuard.MAX_BUCKETS *
        BriefingsPdfRateLimitGuard.FORCED_EVICTION_FRACTION,
    )
    const sorted = [...this.buckets.entries()].sort(
      (a, b) => a[1].lastRefillMs - b[1].lastRefillMs,
    )
    for (let i = 0; i < target && i < sorted.length; i++) {
      this.buckets.delete(sorted[i][0])
    }
    this.logger.warn(
      `Rate-limit cap hit: evicted ${target} oldest buckets (size now ${this.buckets.size}). ` +
        `Possible IP-rotation attack — review access logs.`,
    )
  }
}
