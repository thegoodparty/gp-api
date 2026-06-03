import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common'
import { ExperimentRunStatus } from '@prisma/client'
import { CampaignStrategyService } from './campaignStrategy.service'

const campaign = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 99,
    organizationSlug: 'org-99',
    details: { raceId: 'br-general' },
    user: {
      clerkId: 'clerk-1',
      email: 'jane@example.com',
      firstName: 'Jane',
      lastName: 'Doe',
      name: null,
    },
    ...overrides,
  }) as never

const run = (overrides: Record<string, unknown> = {}) =>
  ({
    runId: 'run-x',
    organizationSlug: 'org-99',
    experimentType: 'opposition_research',
    status: ExperimentRunStatus.COMPLETED,
    params: {},
    artifactBucket: 'bucket',
    artifactKey: 'key',
    durationSeconds: null,
    costUsd: null,
    error: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as never

describe('CampaignStrategyService', () => {
  let service: CampaignStrategyService
  let params: { build: ReturnType<typeof vi.fn> }
  let experimentRuns: {
    findUnique: ReturnType<typeof vi.fn>
    dispatchRun: ReturnType<typeof vi.fn>
    markFailed: ReturnType<typeof vi.fn>
  }
  let persister: {
    persistOpponents: ReturnType<typeof vi.fn>
    persistOpportunitiesAndChallenges: ReturnType<typeof vi.fn>
  }
  let s3: { getFile: ReturnType<typeof vi.fn> }
  let prisma: { campaignStrategy: Record<string, ReturnType<typeof vi.fn>> }

  const planRow = (overrides: Record<string, unknown> = {}) => ({
    id: 42,
    campaignId: 99,
    oppositionRunId: null,
    opportunitiesRunId: null,
    oppositionAttempts: 0,
    opportunitiesAttempts: 0,
    ...overrides,
  })

  beforeEach(() => {
    params = { build: vi.fn().mockResolvedValue({ race_id: 'br-general' }) }
    experimentRuns = {
      findUnique: vi.fn().mockResolvedValue(null),
      dispatchRun: vi.fn(),
      markFailed: vi.fn().mockResolvedValue(undefined),
    }
    persister = {
      persistOpponents: vi.fn().mockResolvedValue(undefined),
      persistOpportunitiesAndChallenges: vi.fn().mockResolvedValue(undefined),
    }
    s3 = { getFile: vi.fn() }
    prisma = {
      campaignStrategy: {
        upsert: vi.fn().mockResolvedValue(planRow()),
        findUnique: vi.fn(),
        update: vi.fn().mockResolvedValue(undefined),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findFirst: vi.fn().mockResolvedValue(planRow()),
      },
    }
    // The last three deps (communityEvents, electionApi, races) belong to the
    // community-events pipeline and are never touched by the CAP strategic-
    // landscape paths exercised here, so no-op mocks suffice. Community-events
    // behavior is covered in campaignStrategy.service.test.ts.
    service = new CampaignStrategyService(
      params as never,
      experimentRuns as never,
      persister as never,
      s3 as never,
      { generate: vi.fn() } as never,
      { getRaceContext: vi.fn() } as never,
      { getZipCodesByRaceId: vi.fn() } as never,
    )
    Object.defineProperty(service, '_prisma', { value: prisma })
    Object.assign(service, { findFirst: prisma.campaignStrategy.findFirst })
  })

  it('rejects a campaign with no raceId', async () => {
    await expect(
      service.getOrGenerateStrategicLandscape(campaign({ details: {} })),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('dispatches both experiments and stores run ids when none exist', async () => {
    experimentRuns.dispatchRun
      .mockResolvedValueOnce({ runId: 'opp-run' })
      .mockResolvedValueOnce({ runId: 'oc-run' })

    const res = await service.getOrGenerateStrategicLandscape(campaign())

    expect(res).toEqual({ status: 'generating' })
    expect(params.build).toHaveBeenCalledTimes(1)
    expect(experimentRuns.dispatchRun).toHaveBeenCalledTimes(2)
    const types = experimentRuns.dispatchRun.mock.calls.map((c) => c[0].type)
    expect(types.sort()).toEqual([
      'opportunities_and_challenges',
      'opposition_research',
    ])
    // both dispatches carry the resolved org slug, clerk id, and built params
    for (const type of [
      'opposition_research',
      'opportunities_and_challenges',
    ]) {
      expect(experimentRuns.dispatchRun).toHaveBeenCalledWith(
        expect.objectContaining({
          type,
          organizationSlug: 'org-99',
          clerkUserId: 'clerk-1',
          params: { race_id: 'br-general' },
        }),
      )
    }
    // A from-idle start also stamps generationStartedAt (the duration anchor).
    expect(prisma.campaignStrategy.update).toHaveBeenCalledWith({
      where: { id: 42 },
      data: {
        oppositionRunId: 'opp-run',
        generationStartedAt: expect.any(Date),
      },
    })
    expect(prisma.campaignStrategy.update).toHaveBeenCalledWith({
      where: { id: 42 },
      data: {
        opportunitiesRunId: 'oc-run',
        generationStartedAt: expect.any(Date),
      },
    })
  })

  it('reports failed (not generating) when NO dispatch produces a run', async () => {
    experimentRuns.dispatchRun.mockResolvedValue(undefined) // no queue configured

    const res = await service.getOrGenerateStrategicLandscape(campaign())

    expect(res).toEqual({ status: 'failed' })
    expect(prisma.campaignStrategy.update).not.toHaveBeenCalled()
  })

  it('stays generating on a partial dispatch (one run created), no failed flip', async () => {
    // opposition dispatches, opportunities send fails -> keep the one that
    // worked and report generating; the other retries next poll.
    experimentRuns.dispatchRun
      .mockResolvedValueOnce({ runId: 'opp-run' })
      .mockResolvedValueOnce(undefined)

    const res = await service.getOrGenerateStrategicLandscape(campaign())

    expect(res).toEqual({ status: 'generating' })
    expect(prisma.campaignStrategy.update).toHaveBeenCalledTimes(1)
    expect(prisma.campaignStrategy.update).toHaveBeenCalledWith({
      where: { id: 42 },
      data: {
        oppositionRunId: 'opp-run',
        generationStartedAt: expect.any(Date),
      },
    })
  })

  it('throws when the user has no clerkId', async () => {
    await expect(
      service.getOrGenerateStrategicLandscape(
        campaign({
          user: {
            clerkId: null,
            email: 'j@e.com',
            firstName: 'J',
            lastName: 'D',
          },
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(experimentRuns.dispatchRun).not.toHaveBeenCalled()
  })

  it('returns ready with mapped data once both sections are persisted', async () => {
    prisma.campaignStrategy.upsert.mockResolvedValue(
      planRow({
        oppositionRunId: 'opp-run',
        opportunitiesRunId: 'oc-run',
        oppositionPersistedAt: new Date(),
        opportunitiesPersistedAt: new Date(),
      }),
    )
    prisma.campaignStrategy.findUnique.mockResolvedValue({
      opportunities: [{ content: 'o1' }],
      challenges: [{ content: 'c1' }],
      opponents: [
        {
          fullName: 'Rival',
          partyAffiliation: 'Nonpartisan',
          incumbent: false,
        },
      ],
    })

    const res = await service.getOrGenerateStrategicLandscape(campaign())

    expect(res).toEqual({
      status: 'ready',
      data: {
        opportunities: ['o1'],
        challenges: ['c1'],
        opponents: [
          {
            fullName: 'Rival',
            partyAffiliation: 'Nonpartisan',
            incumbent: false,
          },
        ],
      },
    })
    expect(experimentRuns.dispatchRun).not.toHaveBeenCalled()
  })

  it('stays generating when a run is COMPLETED but its section is not persisted', async () => {
    // The race window: both runs done, but only one section's rows have landed.
    prisma.campaignStrategy.upsert.mockResolvedValue(
      planRow({
        oppositionRunId: 'opp-run',
        opportunitiesRunId: 'oc-run',
        oppositionPersistedAt: new Date(),
        opportunitiesPersistedAt: null,
      }),
    )
    const runsById: Record<string, unknown> = {
      'opp-run': run({ runId: 'opp-run' }),
      'oc-run': run({
        runId: 'oc-run',
        experimentType: 'opportunities_and_challenges',
      }),
    }
    experimentRuns.findUnique.mockImplementation(
      (args: { where: { runId: string } }) =>
        Promise.resolve(runsById[args.where.runId] ?? null),
    )

    const res = await service.getOrGenerateStrategicLandscape(campaign())

    expect(res).toEqual({ status: 'generating' })
    expect(experimentRuns.dispatchRun).not.toHaveBeenCalled()
  })

  it('re-dispatches a COMPLETED-but-unpersisted section past the grace window', async () => {
    // markFailed + persist both failed: run stuck COMPLETED with no marker.
    // Instead of terminal-failing, the section re-dispatches on this call.
    const stale = new Date(Date.now() - 30 * 60 * 1000) // 30 min ago
    prisma.campaignStrategy.upsert.mockResolvedValue(
      planRow({
        oppositionRunId: 'opp-run',
        opportunitiesRunId: 'oc-run',
        oppositionPersistedAt: null,
        opportunitiesPersistedAt: new Date(),
      }),
    )
    const runsById: Record<string, unknown> = {
      'opp-run': run({ runId: 'opp-run', updatedAt: stale }),
      'oc-run': run({
        runId: 'oc-run',
        experimentType: 'opportunities_and_challenges',
      }),
    }
    experimentRuns.findUnique.mockImplementation(
      (args: { where: { runId: string } }) =>
        Promise.resolve(runsById[args.where.runId] ?? null),
    )
    experimentRuns.dispatchRun.mockResolvedValue({ runId: 'opp-retry' })

    const res = await service.getOrGenerateStrategicLandscape(campaign())

    expect(res).toEqual({ status: 'generating' })
    expect(experimentRuns.dispatchRun).toHaveBeenCalledTimes(1)
    expect(experimentRuns.dispatchRun).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'opposition_research' }),
    )
    // Nothing else was in flight (opportunities already persisted), so this
    // retry is a fresh start and re-stamps the duration anchor.
    expect(prisma.campaignStrategy.update).toHaveBeenCalledWith({
      where: { id: 42 },
      data: {
        oppositionRunId: 'opp-retry',
        generationStartedAt: expect.any(Date),
      },
    })
  })

  it('reports failed (not 502) when an SQS dispatch throws', async () => {
    experimentRuns.dispatchRun.mockRejectedValue(new Error('sqs unavailable'))

    const res = await service.getOrGenerateStrategicLandscape(campaign())

    expect(res).toEqual({ status: 'failed' })
    expect(prisma.campaignStrategy.update).not.toHaveBeenCalled()
  })

  it('throws if the strategy row vanishes between upsert and read', async () => {
    prisma.campaignStrategy.upsert.mockResolvedValue(
      planRow({
        oppositionRunId: 'opp-run',
        opportunitiesRunId: 'oc-run',
        oppositionPersistedAt: new Date(),
        opportunitiesPersistedAt: new Date(),
      }),
    )
    prisma.campaignStrategy.findUnique.mockResolvedValue(null)

    await expect(
      service.getOrGenerateStrategicLandscape(campaign()),
    ).rejects.toBeInstanceOf(InternalServerErrorException)
  })

  it('stays generating without re-dispatching while a run is still RUNNING', async () => {
    prisma.campaignStrategy.upsert.mockResolvedValue(
      planRow({ oppositionRunId: 'opp-run', opportunitiesRunId: 'oc-run' }),
    )
    const runsById: Record<string, unknown> = {
      'opp-run': run({
        runId: 'opp-run',
        status: ExperimentRunStatus.COMPLETED,
      }),
      'oc-run': run({ runId: 'oc-run', status: ExperimentRunStatus.RUNNING }),
    }
    experimentRuns.findUnique.mockImplementation(
      (args: { where: { runId: string } }) =>
        Promise.resolve(runsById[args.where.runId] ?? null),
    )

    const res = await service.getOrGenerateStrategicLandscape(campaign())

    expect(res).toEqual({ status: 'generating' })
    expect(params.build).not.toHaveBeenCalled()
    expect(experimentRuns.dispatchRun).not.toHaveBeenCalled()
  })

  it('re-dispatches a section whose previous run FAILED', async () => {
    prisma.campaignStrategy.upsert.mockResolvedValue(
      planRow({ oppositionRunId: 'opp-run', opportunitiesRunId: 'oc-run' }),
    )
    const runsById: Record<string, unknown> = {
      'opp-run': run({ runId: 'opp-run', status: ExperimentRunStatus.FAILED }),
      'oc-run': run({ runId: 'oc-run', status: ExperimentRunStatus.RUNNING }),
    }
    experimentRuns.findUnique.mockImplementation(
      (args: { where: { runId: string } }) =>
        Promise.resolve(runsById[args.where.runId] ?? null),
    )
    experimentRuns.dispatchRun.mockResolvedValue({ runId: 'opp-retry' })

    const res = await service.getOrGenerateStrategicLandscape(campaign())

    expect(res).toEqual({ status: 'generating' })
    expect(experimentRuns.dispatchRun).toHaveBeenCalledTimes(1)
    expect(experimentRuns.dispatchRun).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'opposition_research' }),
    )
    // The opportunities run is still in flight, so this retry joins the
    // existing generation and must NOT re-stamp the duration anchor.
    expect(prisma.campaignStrategy.update).toHaveBeenCalledWith({
      where: { id: 42 },
      data: { oppositionRunId: 'opp-retry' },
    })
  })

  it('claims an attempt slot per re-dispatch via an atomic conditional update', async () => {
    prisma.campaignStrategy.upsert.mockResolvedValue(
      planRow({ oppositionRunId: 'opp-run', opportunitiesRunId: 'oc-run' }),
    )
    const runsById: Record<string, unknown> = {
      'opp-run': run({ runId: 'opp-run', status: ExperimentRunStatus.FAILED }),
      'oc-run': run({ runId: 'oc-run', status: ExperimentRunStatus.RUNNING }),
    }
    experimentRuns.findUnique.mockImplementation(
      (args: { where: { runId: string } }) =>
        Promise.resolve(runsById[args.where.runId] ?? null),
    )
    experimentRuns.dispatchRun.mockResolvedValue({ runId: 'opp-retry' })

    await service.getOrGenerateStrategicLandscape(campaign())

    expect(prisma.campaignStrategy.updateMany).toHaveBeenCalledWith({
      where: { id: 42, oppositionAttempts: { lt: 3 } },
      data: { oppositionAttempts: { increment: 1 } },
    })
  })

  it('reports failed (terminal) once a section hits the attempt cap', async () => {
    prisma.campaignStrategy.upsert.mockResolvedValue(
      planRow({ oppositionRunId: 'opp-run', opportunitiesRunId: 'oc-run' }),
    )
    const runsById: Record<string, unknown> = {
      'opp-run': run({ runId: 'opp-run', status: ExperimentRunStatus.FAILED }),
      'oc-run': run({ runId: 'oc-run', status: ExperimentRunStatus.RUNNING }),
    }
    experimentRuns.findUnique.mockImplementation(
      (args: { where: { runId: string } }) =>
        Promise.resolve(runsById[args.where.runId] ?? null),
    )
    // The atomic claim finds no remaining slots -> cap reached, no new run.
    prisma.campaignStrategy.updateMany.mockResolvedValue({ count: 0 })

    const res = await service.getOrGenerateStrategicLandscape(campaign())

    expect(res).toEqual({ status: 'failed' })
    expect(experimentRuns.dispatchRun).not.toHaveBeenCalled()
    expect(prisma.campaignStrategy.update).not.toHaveBeenCalled()
  })

  it('persists opponents when an opposition run completes', async () => {
    s3.getFile.mockResolvedValue(
      JSON.stringify({
        opponents: [
          {
            full_name: 'Rival',
            party_affiliation: 'Nonpartisan',
            incumbent: true,
          },
        ],
      }),
    )

    await service.onExperimentRunCompleted(
      run({ runId: 'opp-run', experimentType: 'opposition_research' }),
    )

    expect(persister.persistOpponents).toHaveBeenCalledWith(42, [
      { fullName: 'Rival', partyAffiliation: 'Nonpartisan', incumbent: true },
    ])
  })

  it('persists opportunities + challenges when that run completes', async () => {
    s3.getFile.mockResolvedValue(
      JSON.stringify({ opportunities: ['o1', 'o2'], challenges: ['c1'] }),
    )

    await service.onExperimentRunCompleted(
      run({ runId: 'oc-run', experimentType: 'opportunities_and_challenges' }),
    )

    expect(persister.persistOpportunitiesAndChallenges).toHaveBeenCalledWith(
      42,
      ['o1', 'o2'],
      ['c1'],
    )
  })

  it('ignores non-CAP and non-completed runs', async () => {
    await service.onExperimentRunCompleted(
      run({ experimentType: 'district_issue_pulse' }),
    )
    await service.onExperimentRunCompleted(
      run({ status: ExperimentRunStatus.FAILED }),
    )

    expect(s3.getFile).not.toHaveBeenCalled()
    expect(persister.persistOpponents).not.toHaveBeenCalled()
    expect(persister.persistOpportunitiesAndChallenges).not.toHaveBeenCalled()
    expect(experimentRuns.markFailed).not.toHaveBeenCalled()
  })

  it('marks the run failed when a completed run has no artifact location', async () => {
    await expect(
      service.onExperimentRunCompleted(
        run({ runId: 'opp-run', artifactKey: null }),
      ),
    ).rejects.toThrow()

    expect(experimentRuns.markFailed).toHaveBeenCalledWith(
      'opp-run',
      'completed run has no artifact location',
    )
    expect(s3.getFile).not.toHaveBeenCalled()
  })

  it('persists an empty opponent list for an uncontested race', async () => {
    s3.getFile.mockResolvedValue(JSON.stringify({ opponents: [] }))

    await service.onExperimentRunCompleted(
      run({ runId: 'opp-run', experimentType: 'opposition_research' }),
    )

    expect(persister.persistOpponents).toHaveBeenCalledWith(42, [])
    expect(experimentRuns.markFailed).not.toHaveBeenCalled()
  })

  it('does nothing when no plan references the completed run', async () => {
    prisma.campaignStrategy.findFirst.mockResolvedValue(null)
    s3.getFile.mockResolvedValue(JSON.stringify({ opponents: [] }))

    await service.onExperimentRunCompleted(
      run({ runId: 'orphan', experimentType: 'opposition_research' }),
    )

    expect(s3.getFile).not.toHaveBeenCalled()
    expect(persister.persistOpponents).not.toHaveBeenCalled()
    expect(experimentRuns.markFailed).not.toHaveBeenCalled()
  })

  it('marks the run failed when persisting the artifact throws', async () => {
    s3.getFile.mockResolvedValue(
      JSON.stringify({
        opponents: [
          {
            full_name: 'Rival',
            party_affiliation: 'Nonpartisan',
            incumbent: true,
          },
        ],
      }),
    )
    persister.persistOpponents.mockRejectedValue(new Error('db down'))

    await expect(
      service.onExperimentRunCompleted(
        run({ runId: 'opp-run', experimentType: 'opposition_research' }),
      ),
    ).rejects.toThrow('db down')

    expect(experimentRuns.markFailed).toHaveBeenCalledWith('opp-run', 'db down')
  })

  it('marks the run failed when the artifact body is empty', async () => {
    s3.getFile.mockResolvedValue(undefined)

    await expect(
      service.onExperimentRunCompleted(
        run({ runId: 'opp-run', experimentType: 'opposition_research' }),
      ),
    ).rejects.toThrow()

    expect(experimentRuns.markFailed).toHaveBeenCalledWith(
      'opp-run',
      'artifact is missing or empty',
    )
    expect(persister.persistOpponents).not.toHaveBeenCalled()
  })
})
