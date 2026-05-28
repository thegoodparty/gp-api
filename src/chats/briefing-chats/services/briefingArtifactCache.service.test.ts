import { BadGatewayException, NotFoundException } from '@nestjs/common'
import { PinoLogger } from 'nestjs-pino'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import { S3Service } from '@/vendors/aws/services/s3.service'
import { BriefingArtifactCacheService } from './briefingArtifactCache.service'

const BUCKET = 'b'
const KEY = 'k.md'
const BODY = '# Briefing\n\nbody'

const noop = (): void => undefined

class FakeS3Service {
  fetchCount = 0
  private store = new Map<string, string | undefined>()
  private errors = new Map<string, Error>()
  private gates = new Map<string, Promise<void>>()
  private releasers = new Map<string, () => void>()

  seed(bucket: string, key: string, body: string | undefined): void {
    this.store.set(`${bucket}/${key}`, body)
  }

  seedError(bucket: string, key: string, error: Error): void {
    this.errors.set(`${bucket}/${key}`, error)
  }

  gate(bucket: string, key: string): () => void {
    const id = `${bucket}/${key}`
    let release: () => void = noop
    const promise = new Promise<void>((resolve) => {
      release = resolve
    })
    this.gates.set(id, promise)
    this.releasers.set(id, release)
    return release
  }

  async getFile(bucket: string, key: string): Promise<string | undefined> {
    const id = `${bucket}/${key}`
    this.fetchCount += 1
    const gate = this.gates.get(id)
    if (gate) await gate
    const err = this.errors.get(id)
    if (err) throw err
    return this.store.get(id)
  }

  asService(): S3Service {
    return this as unknown as S3Service
  }
}

const build = (): {
  s3: FakeS3Service
  logger: PinoLogger
  cache: BriefingArtifactCacheService
} => {
  const s3 = new FakeS3Service()
  const logger = createMockLogger()
  const cache = new BriefingArtifactCacheService(s3.asService(), logger)
  return { s3, logger, cache }
}

describe('BriefingArtifactCacheService', () => {
  beforeEach(() => {
    vi.useRealTimers()
  })

  it('fetches from S3 on cache miss and returns the body', async () => {
    const { s3, cache } = build()
    s3.seed(BUCKET, KEY, BODY)

    const result = await cache.get(BUCKET, KEY)

    expect(result).toBe(BODY)
    expect(s3.fetchCount).toBe(1)
  })

  it('returns cached value without calling S3 on cache hit', async () => {
    const { s3, cache } = build()
    s3.seed(BUCKET, KEY, BODY)

    await cache.get(BUCKET, KEY)
    const second = await cache.get(BUCKET, KEY)

    expect(second).toBe(BODY)
    expect(s3.fetchCount).toBe(1)
  })

  it('expires entries after the TTL elapses', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-14T00:00:00Z'))
    const { s3, cache } = build()
    s3.seed(BUCKET, KEY, BODY)

    await cache.get(BUCKET, KEY)
    vi.setSystemTime(new Date('2026-05-14T00:16:00Z'))
    await cache.get(BUCKET, KEY)

    expect(s3.fetchCount).toBe(2)
  })

  it('coalesces concurrent calls into a single S3 fetch', async () => {
    const { s3, cache } = build()
    s3.seed(BUCKET, KEY, BODY)
    const release = s3.gate(BUCKET, KEY)

    const calls = Array.from({ length: 100 }, () => cache.get(BUCKET, KEY))
    release()
    const results = await Promise.all(calls)

    expect(s3.fetchCount).toBe(1)
    for (const r of results) expect(r).toBe(BODY)
  })

  it('throws NotFoundException when S3 returns undefined (NoSuchKey)', async () => {
    const { cache } = build()

    await expect(cache.get(BUCKET, KEY)).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })

  it('throws BadGatewayException when artifact exceeds size limit', async () => {
    const { s3, cache } = build()
    const huge = 'a'.repeat(1 * 1024 * 1024 + 1)
    s3.seed(BUCKET, KEY, huge)

    await expect(cache.get(BUCKET, KEY)).rejects.toBeInstanceOf(
      BadGatewayException,
    )
  })

  it('throws BadGatewayException when S3 throws a generic error', async () => {
    const { s3, cache } = build()
    s3.seedError(BUCKET, KEY, new Error('connection reset'))

    await expect(cache.get(BUCKET, KEY)).rejects.toBeInstanceOf(
      BadGatewayException,
    )
  })

  it('logs an error before rethrowing when S3 fails', async () => {
    const { s3, logger, cache } = build()
    const boom = new Error('connection reset')
    s3.seedError(BUCKET, KEY, boom)

    await expect(cache.get(BUCKET, KEY)).rejects.toBeInstanceOf(
      BadGatewayException,
    )
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: boom, bucket: BUCKET, key: KEY }),
      expect.stringContaining('failed to fetch briefing artifact'),
    )
  })

  it('evicts the oldest entry when the cache is full', async () => {
    const { s3, cache } = build()
    const MAX = 50
    for (let i = 0; i < MAX; i += 1) s3.seed(BUCKET, `k-${i}`, `v-${i}`)
    s3.seed(BUCKET, 'k-new', 'v-new')

    for (let i = 0; i < MAX; i += 1) await cache.get(BUCKET, `k-${i}`)
    await cache.get(BUCKET, 'k-new')
    await cache.get(BUCKET, 'k-0')

    expect(s3.fetchCount).toBe(MAX + 2)
  })

  it('moves an entry to most-recent on cache hit (true LRU)', async () => {
    const { s3, cache } = build()
    const MAX = 50
    for (let i = 0; i < MAX; i += 1) s3.seed(BUCKET, `k-${i}`, `v-${i}`)
    s3.seed(BUCKET, 'k-new', 'v-new')

    for (let i = 0; i < MAX; i += 1) await cache.get(BUCKET, `k-${i}`)
    const fetchesAfterFill = s3.fetchCount

    await cache.get(BUCKET, 'k-0')
    expect(s3.fetchCount).toBe(fetchesAfterFill)

    await cache.get(BUCKET, 'k-new')
    expect(s3.fetchCount).toBe(fetchesAfterFill + 1)

    await cache.get(BUCKET, 'k-0')
    expect(s3.fetchCount).toBe(fetchesAfterFill + 1)

    await cache.get(BUCKET, 'k-1')
    expect(s3.fetchCount).toBe(fetchesAfterFill + 2)
  })

  it('does not cache failed fetches', async () => {
    const { s3, cache } = build()
    s3.seedError(BUCKET, KEY, new Error('first failure'))

    await expect(cache.get(BUCKET, KEY)).rejects.toBeInstanceOf(
      BadGatewayException,
    )
    s3.seed(BUCKET, KEY, BODY)
    s3.seedError(BUCKET, KEY, undefined as unknown as Error)
    const errors = (s3 as unknown as { errors: Map<string, Error> }).errors
    errors.delete(`${BUCKET}/${KEY}`)
    const result = await cache.get(BUCKET, KEY)

    expect(result).toBe(BODY)
  })
})
