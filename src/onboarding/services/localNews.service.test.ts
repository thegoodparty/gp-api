import { createMockLogger } from 'src/shared/test-utils/mockLogger.util'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OnboardingLocalNewsService } from './localNews.service'

const PENDING_TTL_MS = 5 * 60 * 1000
const OFFICE = 'Denver City Council - District 9'
const STATE = 'CO'
// city is intentionally null on these tests — most onboarding callers pass
// no city. The cache key still has to reflect that explicitly.
const CITY: string | null = null

const cacheKey = (
  overrides: Partial<{
    office: string
    city: string | null
    state: string
  }> = {},
) => ({
  office: OFFICE,
  city: CITY,
  state: STATE,
  ...overrides,
})

function makeService() {
  const gemini = {
    generateStructured: vi.fn(),
  }
  // Pass-through tracedNested: invoke the wrapped fn unchanged so the test
  // observes the underlying gemini call without caring about the span shape.
  const braintrust = {
    tracedNested: vi.fn(
      <T>(_name: string, fn: () => Promise<T>): Promise<T> => fn(),
    ),
  }
  const model = {
    update: vi.fn().mockResolvedValue(undefined),
  }
  const campaigns = {
    findFirst: vi.fn(),
    model,
  }
  const service = new OnboardingLocalNewsService(
    gemini as never,
    braintrust as never,
    campaigns as never,
    createMockLogger(),
  )
  return { service, gemini, braintrust, campaigns, model }
}

function readyOutlets(extra: { name: string }[] = []) {
  return [
    {
      name: 'KMGH Denver7',
      type: 'TV',
      description: 'd',
      email: null,
      phone: null,
      address: null,
    },
    ...extra.map((e) => ({
      name: e.name,
      type: 'TV' as const,
      description: 'd',
      email: null,
      phone: null,
      address: null,
    })),
  ]
}

describe('OnboardingLocalNewsService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getLocalNews', () => {
    it('returns the cached outlets when the (office, city, state) key matches', async () => {
      const { service, gemini } = makeService()
      const outlets = readyOutlets()
      const cached = { ...cacheKey(), status: 'ready', outlets }

      const result = await service.getLocalNews({
        state: STATE,
        office: OFFICE,
        campaign: {
          id: 1,
          data: { onboarding: { localMediaOutlets: cached } },
        } as never,
      })

      expect(result).toEqual({ status: 'ready', outlets })
      expect(gemini.generateStructured).not.toHaveBeenCalled()
    })

    it('ignores a cached entry for a different city even when office matches', async () => {
      // The bug this guards against: Denver City Council cache hit served to
      // a Boulder City Council fetch because office matched.
      const { service, campaigns, gemini, model } = makeService()
      const denverCached = {
        office: OFFICE,
        city: 'Denver',
        state: STATE,
        status: 'ready' as const,
        outlets: readyOutlets(),
      }
      campaigns.findFirst.mockResolvedValue({
        id: 1,
        data: { onboarding: { localMediaOutlets: denverCached } },
      })
      gemini.generateStructured.mockResolvedValue({ outlets: [] })

      const result = await service.getLocalNews({
        state: STATE,
        city: 'Boulder',
        office: OFFICE,
        campaign: {
          id: 1,
          data: { onboarding: { localMediaOutlets: denverCached } },
        } as never,
      })

      // Should NOT return the Denver outlets. Should fall through to
      // markPending and report pending.
      expect(result).toEqual({ status: 'pending' })
      // markPending wrote a fresh marker keyed to Boulder.
      const claimWrite = model.update.mock.calls[0]?.[0]
      expect(claimWrite?.data.data.onboarding.localMediaOutlets).toMatchObject({
        office: OFFICE,
        city: 'Boulder',
        state: STATE,
        status: 'pending',
      })
    })

    it('returns pending without calling markPending when a fresh pending entry exists for the same key', async () => {
      const { service, campaigns, gemini, model } = makeService()
      const result = await service.getLocalNews({
        state: STATE,
        office: OFFICE,
        campaign: {
          id: 1,
          data: {
            onboarding: {
              localMediaOutlets: {
                ...cacheKey(),
                status: 'pending',
                startedAt: Date.now() - 1000,
              },
            },
          },
        } as never,
      })

      expect(result).toEqual({ status: 'pending' })
      expect(campaigns.findFirst).not.toHaveBeenCalled()
      expect(model.update).not.toHaveBeenCalled()
      expect(gemini.generateStructured).not.toHaveBeenCalled()
    })

    it('falls through TTL-expired pending into markPending', async () => {
      const { service, campaigns, gemini, model } = makeService()
      const expiredCampaign = {
        id: 1,
        data: {
          onboarding: {
            localMediaOutlets: {
              ...cacheKey(),
              status: 'pending',
              startedAt: Date.now() - PENDING_TTL_MS - 1000,
            },
          },
        },
      }
      campaigns.findFirst.mockResolvedValue(expiredCampaign)
      gemini.generateStructured.mockResolvedValue({ outlets: [] })

      const result = await service.getLocalNews({
        state: STATE,
        office: OFFICE,
        campaign: expiredCampaign as never,
      })

      expect(result).toEqual({ status: 'pending' })
      const claimWrite = model.update.mock.calls[0]?.[0]
      expect(claimWrite?.where).toEqual({ id: 1 })
      expect(claimWrite?.data.data.onboarding.localMediaOutlets).toMatchObject({
        office: OFFICE,
        city: CITY,
        state: STATE,
        status: 'pending',
      })
      const claimStartedAt =
        claimWrite?.data.data.onboarding.localMediaOutlets.startedAt
      expect(typeof claimStartedAt).toBe('number')
      expect(claimStartedAt).toBeGreaterThan(0)
    })

    it("doesn't claim the slot when re-read shows a fresh pending entry from another caller", async () => {
      const { service, campaigns, model } = makeService()
      campaigns.findFirst.mockResolvedValue({
        id: 1,
        data: {
          onboarding: {
            localMediaOutlets: {
              ...cacheKey(),
              status: 'pending',
              startedAt: Date.now() - 1000,
            },
          },
        },
      })

      const result = await service.getLocalNews({
        state: STATE,
        office: OFFICE,
        campaign: { id: 1, data: { onboarding: {} } } as never,
      })

      expect(result).toEqual({ status: 'pending' })
      expect(campaigns.findFirst).toHaveBeenCalledTimes(1)
      expect(model.update).not.toHaveBeenCalled()
    })

    it('expires the pending marker (startedAt: 0) when the background fetch fails', async () => {
      const { service, campaigns, gemini, model } = makeService()
      let claimWritten = false
      campaigns.findFirst.mockImplementation(async () => ({
        id: 1,
        data: claimWritten
          ? {
              onboarding: {
                localMediaOutlets: {
                  ...cacheKey(),
                  status: 'pending',
                  startedAt: 12345,
                },
              },
            }
          : { onboarding: {} },
      }))
      model.update.mockImplementation(async () => {
        claimWritten = true
        return undefined
      })
      gemini.generateStructured.mockRejectedValue(new Error('Gemini exploded'))

      await service.getLocalNews({
        state: STATE,
        office: OFFICE,
        campaign: { id: 1, data: { onboarding: {} } } as never,
      })

      await new Promise((resolve) => setImmediate(resolve))
      await new Promise((resolve) => setImmediate(resolve))

      const expireWrite = model.update.mock.calls.find(
        (call) =>
          call[0]?.data.data.onboarding.localMediaOutlets.startedAt === 0,
      )?.[0]
      expect(expireWrite).toBeDefined()
      expect(expireWrite?.data.data.onboarding.localMediaOutlets).toEqual({
        office: OFFICE,
        city: CITY,
        state: STATE,
        status: 'pending',
        startedAt: 0,
      })
    })

    it('persists outlets from gemini.generateStructured on a successful fetch', async () => {
      const { service, campaigns, gemini, model } = makeService()
      const aiOutlets = readyOutlets([{ name: 'Denver Post' }])
      campaigns.findFirst.mockResolvedValue({
        id: 1,
        data: { onboarding: {} },
      })
      gemini.generateStructured.mockResolvedValue({ outlets: aiOutlets })

      await service.getLocalNews({
        state: STATE,
        office: OFFICE,
        campaign: { id: 1, data: { onboarding: {} } } as never,
      })

      await new Promise((resolve) => setImmediate(resolve))
      await new Promise((resolve) => setImmediate(resolve))

      const readyWrite = model.update.mock.calls.find(
        (call) =>
          call[0]?.data.data.onboarding.localMediaOutlets.status === 'ready',
      )?.[0]
      expect(readyWrite?.data.data.onboarding.localMediaOutlets).toEqual({
        office: OFFICE,
        city: CITY,
        state: STATE,
        status: 'ready',
        outlets: aiOutlets,
      })
    })
  })
})
