import { ExecutionContext, HttpException } from '@nestjs/common'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BriefingsPdfRateLimitGuard } from './briefingsPdfRateLimit.guard'

/**
 * The guard maintains an in-memory token bucket keyed by IP. These tests
 * cover the two failure modes Bugbot flagged: unbounded growth when many
 * distinct IPs hit the endpoint, and the headline rate-limit behaviour
 * (refill, refuse, allow-again).
 */

function ctxForIp(ip: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ ip }),
    }),
  } as unknown as ExecutionContext
}

describe('BriefingsPdfRateLimitGuard', () => {
  let guard: BriefingsPdfRateLimitGuard

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-27T20:00:00Z'))
    guard = new BriefingsPdfRateLimitGuard()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('allows requests within the burst capacity', () => {
    for (let i = 0; i < 30; i++) {
      expect(guard.canActivate(ctxForIp('1.2.3.4'))).toBe(true)
    }
  })

  it('refuses the next request after burst is exhausted', () => {
    for (let i = 0; i < 30; i++) {
      guard.canActivate(ctxForIp('1.2.3.4'))
    }
    expect(() => guard.canActivate(ctxForIp('1.2.3.4'))).toThrow(HttpException)
  })

  it('refills tokens over time', () => {
    for (let i = 0; i < 30; i++) {
      guard.canActivate(ctxForIp('1.2.3.4'))
    }
    // Advance 60s — bucket refills to capacity.
    vi.advanceTimersByTime(60_000)
    expect(guard.canActivate(ctxForIp('1.2.3.4'))).toBe(true)
  })

  it('tracks buckets per-IP independently', () => {
    for (let i = 0; i < 30; i++) guard.canActivate(ctxForIp('a'))
    // IP 'a' is exhausted, but 'b' is fresh.
    expect(() => guard.canActivate(ctxForIp('a'))).toThrow(HttpException)
    expect(guard.canActivate(ctxForIp('b'))).toBe(true)
  })

  it('sweeps idle full buckets after the idle TTL', () => {
    guard.canActivate(ctxForIp('first'))
    // Advance past both the idle TTL (5 min) and the sweep interval (1 min)
    // so the sweep runs on the next call and the first bucket — which has
    // had time to refill to capacity — gets reclaimed.
    vi.advanceTimersByTime(6 * 60_000)
    guard.canActivate(ctxForIp('second'))

    const buckets = (
      guard as unknown as {
        buckets: Map<string, { tokens: number; lastRefillMs: number }>
      }
    ).buckets
    expect(buckets.has('first')).toBe(false)
    expect(buckets.has('second')).toBe(true)
  })

  it('caps total bucket count under heavy IP rotation', () => {
    // Stuff 12,000 distinct IPs through the guard. The hard ceiling is
    // 10,000 with a 10% forced-eviction step, so the final map size must
    // never exceed the ceiling.
    for (let i = 0; i < 12_000; i++) {
      guard.canActivate(ctxForIp(`ip-${i}`))
    }
    const buckets = (
      guard as unknown as {
        buckets: Map<string, { tokens: number; lastRefillMs: number }>
      }
    ).buckets
    expect(buckets.size).toBeLessThanOrEqual(10_000)
  })
})
