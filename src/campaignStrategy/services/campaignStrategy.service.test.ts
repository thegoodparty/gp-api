import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BadRequestException } from '@nestjs/common'
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
    ...overrides,
  })

  beforeEach(() => {
    params = { build: vi.fn().mockResolvedValue({ race_id: 'br-general' }) }
    experimentRuns = {
      findUnique: vi.fn().mockResolvedValue(null),
      dispatchRun: vi.fn(),
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
        findFirst: vi.fn().mockResolvedValue(planRow()),
      },
    }
    service = new CampaignStrategyService(
      params as never,
      experimentRuns as never,
      persister as never,
      s3 as never,
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
    expect(types).toEqual([
      'opposition_research',
      'opportunities_and_challenges',
    ])
    expect(prisma.campaignStrategy.update).toHaveBeenCalledWith({
      where: { id: 42 },
      data: { oppositionRunId: 'opp-run' },
    })
    expect(prisma.campaignStrategy.update).toHaveBeenCalledWith({
      where: { id: 42 },
      data: { opportunitiesRunId: 'oc-run' },
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

  it('returns ready with mapped data once both runs complete', async () => {
    prisma.campaignStrategy.upsert.mockResolvedValue(
      planRow({ oppositionRunId: 'opp-run', opportunitiesRunId: 'oc-run' }),
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

  it('re-dispatches only the failed experiment', async () => {
    prisma.campaignStrategy.upsert.mockResolvedValue(
      planRow({ oppositionRunId: 'opp-run', opportunitiesRunId: 'oc-run' }),
    )
    const runsById: Record<string, unknown> = {
      'opp-run': run({ runId: 'opp-run', status: ExperimentRunStatus.FAILED }),
      'oc-run': run({ runId: 'oc-run', status: ExperimentRunStatus.COMPLETED }),
    }
    experimentRuns.findUnique.mockImplementation(
      (args: { where: { runId: string } }) =>
        Promise.resolve(runsById[args.where.runId] ?? null),
    )
    experimentRuns.dispatchRun.mockResolvedValue({ runId: 'opp-run-2' })

    const res = await service.getOrGenerateStrategicLandscape(campaign())

    expect(res).toEqual({ status: 'generating' })
    expect(experimentRuns.dispatchRun).toHaveBeenCalledTimes(1)
    expect(experimentRuns.dispatchRun.mock.calls[0][0].type).toBe(
      'opposition_research',
    )
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

  it('ignores non-CAP, non-completed, or artifact-less runs', async () => {
    await service.onExperimentRunCompleted(
      run({ experimentType: 'district_issue_pulse' }),
    )
    await service.onExperimentRunCompleted(
      run({ status: ExperimentRunStatus.FAILED }),
    )
    await service.onExperimentRunCompleted(run({ artifactKey: null }))

    expect(s3.getFile).not.toHaveBeenCalled()
    expect(persister.persistOpponents).not.toHaveBeenCalled()
    expect(persister.persistOpportunitiesAndChallenges).not.toHaveBeenCalled()
  })
})
