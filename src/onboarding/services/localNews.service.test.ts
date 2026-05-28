import { createMockLogger } from 'src/shared/test-utils/mockLogger.util'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OnboardingLocalNewsService } from './localNews.service'

const PENDING_TTL_MS = 5 * 60 * 1000
const OFFICE = 'Denver City Council - District 9'

function makeService() {
  const ai = {
    getChatToolCompletion: vi.fn(),
  }
  const model = {
    update: vi.fn().mockResolvedValue(undefined),
  }
  const campaigns = {
    findFirst: vi.fn(),
    model,
  }
  const service = new OnboardingLocalNewsService(
    ai as never,
    campaigns as never,
    createMockLogger(),
  )
  return { service, ai, campaigns, model }
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
    it('returns the cached outlets when status=ready and office matches', async () => {
      const { service, campaigns, ai } = makeService()
      const outlets = readyOutlets()
      campaigns.findFirst.mockResolvedValue({
        id: 1,
        data: {
          onboarding: {
            localMediaOutlets: { office: OFFICE, status: 'ready', outlets },
          },
        },
      })

      const result = await service.getLocalNews({
        state: 'CO',
        office: OFFICE,
        campaign: {
          id: 1,
          data: {
            onboarding: {
              localMediaOutlets: { office: OFFICE, status: 'ready', outlets },
            },
          },
        } as never,
      })

      expect(result).toEqual({ status: 'ready', outlets })
      expect(ai.getChatToolCompletion).not.toHaveBeenCalled()
    })

    it('returns pending without calling markPending when a fresh pending entry exists', async () => {
      const { service, campaigns, ai, model } = makeService()
      const result = await service.getLocalNews({
        state: 'CO',
        office: OFFICE,
        campaign: {
          id: 1,
          data: {
            onboarding: {
              localMediaOutlets: {
                office: OFFICE,
                status: 'pending',
                startedAt: Date.now() - 1000,
              },
            },
          },
        } as never,
      })

      expect(result).toEqual({ status: 'pending' })
      // No DB re-read or write, no AI call kicked off — the in-memory snapshot
      // was sufficient to short-circuit.
      expect(campaigns.findFirst).not.toHaveBeenCalled()
      expect(model.update).not.toHaveBeenCalled()
      expect(ai.getChatToolCompletion).not.toHaveBeenCalled()
    })

    it('falls through TTL-expired pending into markPending', async () => {
      const { service, campaigns, ai, model } = makeService()
      const expiredCampaign = {
        id: 1,
        data: {
          onboarding: {
            localMediaOutlets: {
              office: OFFICE,
              status: 'pending',
              startedAt: Date.now() - PENDING_TTL_MS - 1000,
            },
          },
        },
      }
      // Every internal findFirst re-read returns the same expired snapshot
      // so this caller successfully claims the slot.
      campaigns.findFirst.mockResolvedValue(expiredCampaign)
      // runFetch will pass content="" through to the failure path; we just
      // care that markPending's claim write fired.
      ai.getChatToolCompletion.mockResolvedValue({ content: '', tokens: 0 })

      const result = await service.getLocalNews({
        state: 'CO',
        office: OFFICE,
        campaign: expiredCampaign as never,
      })

      expect(result).toEqual({ status: 'pending' })
      // markPending wrote a fresh pending marker via the direct prisma
      // update. The first write is always the claim.
      const claimWrite = model.update.mock.calls[0]?.[0]
      expect(claimWrite?.where).toEqual({ id: 1 })
      expect(claimWrite?.data.data.onboarding.localMediaOutlets).toMatchObject({
        office: OFFICE,
        status: 'pending',
      })
      const claimStartedAt =
        claimWrite?.data.data.onboarding.localMediaOutlets.startedAt
      expect(typeof claimStartedAt).toBe('number')
      expect(claimStartedAt).toBeGreaterThan(0)
    })

    it("doesn't claim the slot when re-read shows a fresh pending entry from another caller", async () => {
      const { service, campaigns, model } = makeService()
      // Caller's in-memory snapshot is stale (no pending marker), but the
      // current DB state shows another caller already claimed the slot.
      campaigns.findFirst.mockResolvedValue({
        id: 1,
        data: {
          onboarding: {
            localMediaOutlets: {
              office: OFFICE,
              status: 'pending',
              startedAt: Date.now() - 1000,
            },
          },
        },
      })

      const result = await service.getLocalNews({
        state: 'CO',
        office: OFFICE,
        campaign: { id: 1, data: { onboarding: {} } } as never,
      })

      expect(result).toEqual({ status: 'pending' })
      // findFirst happened (we re-read) but no write happened because the
      // other caller already owns the pending slot.
      expect(campaigns.findFirst).toHaveBeenCalledTimes(1)
      expect(model.update).not.toHaveBeenCalled()
    })

    it('expires the pending marker (startedAt: 0) when the background fetch fails', async () => {
      const { service, campaigns, ai, model } = makeService()
      // Dynamic responder: after the claim write fires, return the
      // freshly-claimed pending marker on subsequent reads so expirePending's
      // check passes.
      let claimWritten = false
      campaigns.findFirst.mockImplementation(async () => ({
        id: 1,
        data: claimWritten
          ? {
              onboarding: {
                localMediaOutlets: {
                  office: OFFICE,
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
      ai.getChatToolCompletion.mockRejectedValue(new Error('AI exploded'))

      await service.getLocalNews({
        state: 'CO',
        office: OFFICE,
        campaign: { id: 1, data: { onboarding: {} } } as never,
      })

      // Background promise is fire-and-forget; flush microtasks so the
      // expirePending write completes before we assert.
      await new Promise((resolve) => setImmediate(resolve))
      await new Promise((resolve) => setImmediate(resolve))

      // Look for the expire write (startedAt: 0). Order: claim write fires
      // first, then the failure path triggers expirePending's write.
      const expireWrite = model.update.mock.calls.find(
        (call) =>
          call[0]?.data.data.onboarding.localMediaOutlets.startedAt === 0,
      )?.[0]
      expect(expireWrite).toBeDefined()
      expect(expireWrite?.data.data.onboarding.localMediaOutlets).toEqual({
        office: OFFICE,
        status: 'pending',
        startedAt: 0,
      })
    })
  })
})
