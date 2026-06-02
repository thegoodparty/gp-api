import { BadGatewayException, ConflictException } from '@nestjs/common'
import { ExperimentRun, ExperimentRunStatus, Prisma } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import { S3Service } from '@/vendors/aws/services/s3.service'
import { ExperimentRunsService } from '@/agentExperiments/services/experimentRuns.service'
import { AdminAgentRunsService } from './adminAgentRuns.service'

const makeRun = (overrides: Partial<ExperimentRun> = {}): ExperimentRun => ({
  runId: 'run-1',
  organizationSlug: 'org-1',
  experimentType: 'compliance_setup',
  status: ExperimentRunStatus.COMPLETED,
  params: {
    campaign_id: 42,
    candidate_first_name: 'Ada',
    candidate_last_name: 'Lovelace',
    clerk_user_id: 'user_abc',
    election_date: '2026-11-03',
    trigger: 'initial',
  } as Prisma.JsonValue,
  artifactBucket: 'agent-artifacts',
  artifactKey: 'compliance_setup/run-1/artifact.json',
  durationSeconds: 12.5,
  costUsd: 0.42,
  error: null,
  createdAt: new Date('2026-05-01T00:00:00Z'),
  updatedAt: new Date('2026-05-01T00:10:00Z'),
  ...overrides,
})

describe('AdminAgentRunsService', () => {
  let service: AdminAgentRunsService
  let mockModel: {
    findMany: ReturnType<typeof vi.fn>
    count: ReturnType<typeof vi.fn>
    findUniqueOrThrow: ReturnType<typeof vi.fn>
  }
  const s3 = { getFile: vi.fn() }
  const experimentRuns = { dispatchRun: vi.fn() }
  const logger = createMockLogger()

  beforeEach(() => {
    vi.clearAllMocks()

    mockModel = {
      findMany: vi.fn(),
      count: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    }

    service = new AdminAgentRunsService(
      s3 as unknown as S3Service,
      experimentRuns as unknown as ExperimentRunsService,
    )
    Object.defineProperty(service, 'model', {
      get: () => mockModel,
      configurable: true,
    })
    Object.defineProperty(service, 'logger', {
      get: () => logger,
      configurable: true,
    })
  })

  describe('list', () => {
    it('maps rows with a candidate summary and returns the meta envelope', async () => {
      mockModel.findMany.mockResolvedValue([makeRun()])
      mockModel.count.mockResolvedValue(1)

      const result = await service.list({ offset: 0, limit: 20 })

      expect(result).toEqual({
        data: [
          {
            runId: 'run-1',
            experimentType: 'compliance_setup',
            status: ExperimentRunStatus.COMPLETED,
            organizationSlug: 'org-1',
            candidate: {
              firstName: 'Ada',
              lastName: 'Lovelace',
              campaignId: 42,
            },
            durationSeconds: 12.5,
            costUsd: 0.42,
            createdAt: new Date('2026-05-01T00:00:00Z'),
          },
        ],
        meta: { total: 1, offset: 0, limit: 20 },
      })
    })

    it('returns a null candidate when params carry no candidate fields', async () => {
      mockModel.findMany.mockResolvedValue([
        makeRun({
          experimentType: 'meeting_briefing',
          params: { officialName: 'Some Mayor' } as Prisma.JsonValue,
        }),
      ])
      mockModel.count.mockResolvedValue(1)

      const { data } = await service.list({})

      expect(data[0].candidate).toBeNull()
    })

    it('narrows the query by every supplied filter, ordered createdAt desc', async () => {
      mockModel.findMany.mockResolvedValue([])
      mockModel.count.mockResolvedValue(0)

      const createdAfter = new Date('2026-05-01T00:00:00Z')
      const createdBefore = new Date('2026-05-31T00:00:00Z')
      await service.list({
        offset: 10,
        limit: 5,
        experimentType: 'compliance_setup',
        status: ExperimentRunStatus.FAILED,
        organizationSlug: 'org-9',
        createdAfter,
        createdBefore,
      })

      const expectedWhere = {
        experimentType: 'compliance_setup',
        status: ExperimentRunStatus.FAILED,
        organizationSlug: 'org-9',
        createdAt: { gte: createdAfter, lte: createdBefore },
      }
      expect(mockModel.findMany).toHaveBeenCalledWith({
        where: expectedWhere,
        orderBy: { createdAt: Prisma.SortOrder.desc },
        skip: 10,
        take: 5,
      })
      expect(mockModel.count).toHaveBeenCalledWith({ where: expectedWhere })
    })

    it('builds an empty where clause when no filters are supplied', async () => {
      mockModel.findMany.mockResolvedValue([])
      mockModel.count.mockResolvedValue(0)

      await service.list({})

      expect(mockModel.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      )
    })
  })

  describe('detail', () => {
    it('composes the run, parsed artifact, and conversation log from S3', async () => {
      mockModel.findUniqueOrThrow.mockResolvedValue(makeRun())
      s3.getFile.mockImplementation(async (_bucket: string, key: string) =>
        key.endsWith('artifact.json')
          ? JSON.stringify({
              stage: 'tcr_submitted',
              domain: { name: 'x.org' },
            })
          : 'tool: search_domain\ntool: purchase_domain\n',
      )

      const result = await service.detail('run-1')

      expect(s3.getFile).toHaveBeenCalledWith(
        'agent-artifacts',
        'compliance_setup/run-1/artifact.json',
      )
      expect(s3.getFile).toHaveBeenCalledWith(
        'agent-artifacts',
        'compliance_setup/run-1/logs/workspace/conversation.log',
      )
      expect(result.run.runId).toBe('run-1')
      expect(result.artifact).toEqual({
        stage: 'tcr_submitted',
        domain: { name: 'x.org' },
      })
      expect(result.conversationLog).toBe(
        'tool: search_domain\ntool: purchase_domain\n',
      )
    })

    it('returns conversationLog null without throwing when the log object is missing', async () => {
      mockModel.findUniqueOrThrow.mockResolvedValue(makeRun())
      s3.getFile.mockImplementation(async (_bucket: string, key: string) =>
        key.endsWith('artifact.json')
          ? JSON.stringify({ stage: 'done' })
          : undefined,
      )

      const result = await service.detail('run-1')

      expect(result.conversationLog).toBeNull()
      expect(result.artifact).toEqual({ stage: 'done' })
    })

    it('returns null artifact and conversation log without touching S3 for a RUNNING run', async () => {
      mockModel.findUniqueOrThrow.mockResolvedValue(
        makeRun({
          status: ExperimentRunStatus.RUNNING,
          artifactBucket: null,
          artifactKey: null,
        }),
      )

      const result = await service.detail('run-1')

      expect(result.artifact).toBeNull()
      expect(result.conversationLog).toBeNull()
      expect(s3.getFile).not.toHaveBeenCalled()
    })

    it('returns null artifact (logged) when the artifact JSON is malformed', async () => {
      mockModel.findUniqueOrThrow.mockResolvedValue(makeRun())
      s3.getFile.mockImplementation(async (_bucket: string, key: string) =>
        key.endsWith('artifact.json') ? '{not json' : undefined,
      )

      const result = await service.detail('run-1')

      expect(result.artifact).toBeNull()
      expect(logger.error).toHaveBeenCalled()
    })

    it('propagates the not-found error for an unknown runId', async () => {
      mockModel.findUniqueOrThrow.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('No ExperimentRun found', {
          code: 'P2025',
          clientVersion: 'test',
        }),
      )

      await expect(service.detail('missing')).rejects.toThrow()
      expect(s3.getFile).not.toHaveBeenCalled()
    })
  })

  describe('retry', () => {
    it('re-dispatches with the stored type, org, params, and clerk_user_id, and returns the new run', async () => {
      const run = makeRun()
      const newRun = makeRun({
        runId: 'run-2',
        status: ExperimentRunStatus.RUNNING,
        artifactBucket: null,
        artifactKey: null,
        durationSeconds: null,
        costUsd: null,
      })
      mockModel.findUniqueOrThrow.mockResolvedValue(run)
      experimentRuns.dispatchRun.mockResolvedValue(newRun)

      const result = await service.retry('run-1')

      expect(experimentRuns.dispatchRun).toHaveBeenCalledWith({
        type: 'compliance_setup',
        organizationSlug: 'org-1',
        clerkUserId: 'user_abc',
        // trigger flips initial -> recovery_resume so the re-dispatch resumes
        // from durable state instead of re-running paid side effects.
        params: {
          campaign_id: 42,
          candidate_first_name: 'Ada',
          candidate_last_name: 'Lovelace',
          clerk_user_id: 'user_abc',
          election_date: '2026-11-03',
          trigger: 'recovery_resume',
        },
      })
      expect(result).toBe(newRun)
    })

    it('drops a stale run_id so the agent uses the fresh dispatch run id', async () => {
      mockModel.findUniqueOrThrow.mockResolvedValue(
        makeRun({
          params: {
            campaign_id: 42,
            candidate_first_name: 'Ada',
            candidate_last_name: 'Lovelace',
            clerk_user_id: 'user_abc',
            election_date: '2026-11-03',
            trigger: 'initial',
            run_id: 'stale-run-id',
          } as Prisma.JsonValue,
        }),
      )
      experimentRuns.dispatchRun.mockResolvedValue(makeRun({ runId: 'run-2' }))

      await service.retry('run-1')

      const dispatchedParams =
        experimentRuns.dispatchRun.mock.calls[0][0].params
      expect(dispatchedParams.run_id).toBeUndefined()
      expect(dispatchedParams.trigger).toBe('recovery_resume')
    })

    it('rejects with 409 and never dispatches when the run is still RUNNING', async () => {
      mockModel.findUniqueOrThrow.mockResolvedValue(
        makeRun({ status: ExperimentRunStatus.RUNNING }),
      )

      await expect(service.retry('run-1')).rejects.toBeInstanceOf(
        ConflictException,
      )
      expect(experimentRuns.dispatchRun).not.toHaveBeenCalled()
    })

    it('rejects with 400 (wrong-type message) for a realistic non-retryable run, never dispatching', async () => {
      // A real meeting_briefing run carries no clerk_user_id; the type guard
      // must fire first so the message names the actual reason. Asserting the
      // message (not just the 400) keeps the type guard from being shadowed by
      // the clerk_user_id guard.
      mockModel.findUniqueOrThrow.mockResolvedValue(
        makeRun({
          experimentType: 'meeting_briefing',
          params: {
            officialName: 'Some Mayor',
            state: 'NY',
          } as Prisma.JsonValue,
        }),
      )

      await expect(service.retry('run-1')).rejects.toThrow(
        'cannot be re-dispatched',
      )
      expect(experimentRuns.dispatchRun).not.toHaveBeenCalled()
    })

    it('rejects with 400 (missing-clerk message) when a retryable run lacks clerk_user_id, never dispatching', async () => {
      mockModel.findUniqueOrThrow.mockResolvedValue(
        makeRun({
          params: {
            campaign_id: 42,
            candidate_first_name: 'Ada',
            candidate_last_name: 'Lovelace',
          } as Prisma.JsonValue,
        }),
      )

      await expect(service.retry('run-1')).rejects.toThrow('clerk_user_id')
      expect(experimentRuns.dispatchRun).not.toHaveBeenCalled()
    })

    it('propagates the not-found error for an unknown runId, never dispatching', async () => {
      mockModel.findUniqueOrThrow.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('No ExperimentRun found', {
          code: 'P2025',
          clientVersion: 'test',
        }),
      )

      await expect(service.retry('missing')).rejects.toThrow()
      expect(experimentRuns.dispatchRun).not.toHaveBeenCalled()
    })

    it('surfaces 502 when dispatch is not configured (dispatchRun returns nothing)', async () => {
      mockModel.findUniqueOrThrow.mockResolvedValue(makeRun())
      experimentRuns.dispatchRun.mockResolvedValue(undefined)

      await expect(service.retry('run-1')).rejects.toBeInstanceOf(
        BadGatewayException,
      )
    })
  })
})
