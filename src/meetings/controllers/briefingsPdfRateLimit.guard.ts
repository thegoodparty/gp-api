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
 */
@Injectable()
export class BriefingsPdfRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(BriefingsPdfRateLimitGuard.name)

  // 30 requests per 60s, with a burst of 10. Numbers picked to leave plenty
  // of headroom for legitimate "click the link, refresh, share with team"
  // patterns while shutting down random-UUID enumeration quickly.
  private readonly capacity = 30
  private readonly refillPerMs = 30 / 60_000
  private readonly buckets = new Map<
    string,
    { tokens: number; lastRefillMs: number }
  >()

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<FastifyRequest>()
    const ip = (req.ip ?? 'unknown').toString()
    const now = Date.now()
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
}
