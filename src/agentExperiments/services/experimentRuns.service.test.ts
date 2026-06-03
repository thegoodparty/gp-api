import {
  GetQueueUrlCommand,
  SendMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs'
import { BadGatewayException } from '@nestjs/common'
import { ExperimentRunStatus } from '@prisma/client'
import { mockClient } from 'aws-sdk-client-mock'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import { ExperimentRunsService } from './experimentRuns.service'

const sqsMock = mockClient(SQSClient)
const RESOLVED_URL =
  'https://sqs.us-west-2.amazonaws.com/123/agent-dispatch-dev.fifo'

describe('ExperimentRunsService', () => {
  let service: ExperimentRunsService
  let mockModel: {
    create: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    updateMany: ReturnType<typeof vi.fn>
    findMany: ReturnType<typeof vi.fn>
  }
  const logger = createMockLogger()

  beforeEach(() => {
    sqsMock.reset()
    vi.clearAllMocks()
    process.env.AGENT_DISPATCH_QUEUE_NAME = 'agent-dispatch-dev.fifo'
    sqsMock.on(GetQueueUrlCommand).resolves({ QueueUrl: RESOLVED_URL })

    mockModel = {
      create: vi.fn().mockImplementation(async ({ data }) => data),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      findMany: vi.fn().mockResolvedValue([]),
    }

    service = new ExperimentRunsService()
    Object.defineProperty(service, 'model', {
      get: () => mockModel,
      configurable: true,
    })
    Object.defineProperty(service, 'logger', {
      get: () => logger,
      configurable: true,
    })
  })

  afterEach(() => {
    delete process.env.AGENT_DISPATCH_QUEUE_NAME
  })

  describe('dispatchRun', () => {
    it('creates a RUNNING row and sends an SQS dispatch message', async () => {
      sqsMock.on(SendMessageCommand).resolves({ MessageId: 'm-1' })

      const result = await service.dispatchRun({
        type: 'district_issue_pulse',
        organizationSlug: 'org-1',
        clerkUserId: 'user_test_dispatch',
        params: {
          state: 'CA',
          city: 'San Francisco',
          l2DistrictType: 'city',
          l2DistrictName: 'San Francisco',
        },
      })

      expect(mockModel.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          runId: expect.any(String),
          experimentType: 'district_issue_pulse',
          organizationSlug: 'org-1',
          status: ExperimentRunStatus.RUNNING,
          params: {
            state: 'CA',
            city: 'San Francisco',
            l2DistrictType: 'city',
            l2DistrictName: 'San Francisco',
          },
        }),
      })

      const [call] = sqsMock.commandCalls(SendMessageCommand)
      expect(call).toBeDefined()
      const input = call.args[0].input
      expect(input.QueueUrl).toBe(RESOLVED_URL)
      expect(input.MessageGroupId).toBe('agent-dispatch-org-1')
      expect(input.MessageDeduplicationId).toEqual(expect.any(String))
      const body = JSON.parse(input.MessageBody as string) as Record<
        string,
        unknown
      >
      expect(body).toMatchObject({
        params: {
          state: 'CA',
          city: 'San Francisco',
          l2DistrictType: 'city',
          l2DistrictName: 'San Francisco',
        },
        organization_slug: 'org-1',
        experiment_type: 'district_issue_pulse',
        run_id: expect.any(String),
      })

      expect(result).toMatchObject({
        runId: expect.any(String),
        experimentType: 'district_issue_pulse',
        organizationSlug: 'org-1',
        status: ExperimentRunStatus.RUNNING,
      })
    })

    it('writes the same run_id to the DB row and the SQS message body', async () => {
      sqsMock.on(SendMessageCommand).resolves({ MessageId: 'm-1' })

      await service.dispatchRun({
        type: 'district_issue_pulse',
        organizationSlug: 'org-1',
        clerkUserId: 'user_test_dispatch',
        params: {
          state: 'CA',
          city: 'San Francisco',
          l2DistrictType: 'city',
          l2DistrictName: 'San Francisco',
        },
      })

      const dbRunId = mockModel.create.mock.calls[0][0].data.runId as string
      const [call] = sqsMock.commandCalls(SendMessageCommand)
      const body = JSON.parse(call.args[0].input.MessageBody as string) as {
        run_id: string
        clerk_user_id: string
      }
      expect(body.run_id).toBe(dbRunId)
      expect(body.clerk_user_id).toBe('user_test_dispatch')
    })

    it('namespaces FIFO group per organization so runs for one org serialize', async () => {
      sqsMock.on(SendMessageCommand).resolves({ MessageId: 'm-1' })

      await service.dispatchRun({
        type: 'district_issue_pulse',
        organizationSlug: 'org-alpha',
        clerkUserId: 'user_test_dispatch',
        params: {
          state: 'CA',
          city: 'San Francisco',
          l2DistrictType: 'city',
          l2DistrictName: 'San Francisco',
        },
      })
      await service.dispatchRun({
        type: 'district_issue_pulse',
        organizationSlug: 'org-beta',
        clerkUserId: 'user_test_dispatch',
        params: {
          state: 'CA',
          city: 'San Francisco',
          l2DistrictType: 'city',
          l2DistrictName: 'San Francisco',
        },
      })

      const calls = sqsMock.commandCalls(SendMessageCommand)
      expect(calls[0].args[0].input.MessageGroupId).toBe(
        'agent-dispatch-org-alpha',
      )
      expect(calls[1].args[0].input.MessageGroupId).toBe(
        'agent-dispatch-org-beta',
      )
    })

    it('flips the row to FAILED and throws BadGateway when SQS send fails', async () => {
      sqsMock.on(SendMessageCommand).rejects(new Error('SQS unavailable'))

      await expect(
        service.dispatchRun({
          type: 'district_issue_pulse',
          organizationSlug: 'org-1',
          clerkUserId: 'user_test_dispatch',
          params: {
            state: 'CA',
            city: 'San Francisco',
            l2DistrictType: 'city',
            l2DistrictName: 'San Francisco',
          },
        }),
      ).rejects.toThrow(BadGatewayException)

      expect(mockModel.update).toHaveBeenCalledWith({
        where: { runId: expect.any(String) },
        data: { status: 'FAILED', error: 'SQS dispatch failed' },
      })
      expect(logger.error).toHaveBeenCalled()
    })

    it('does not send to SQS when the DB create fails', async () => {
      mockModel.create.mockRejectedValue(new Error('db down'))

      await expect(
        service.dispatchRun({
          type: 'district_issue_pulse',
          organizationSlug: 'org-1',
          clerkUserId: 'user_test_dispatch',
          params: {
            state: 'CA',
            city: 'San Francisco',
            l2DistrictType: 'city',
            l2DistrictName: 'San Francisco',
          },
        }),
      ).rejects.toThrow('db down')

      expect(sqsMock.commandCalls(SendMessageCommand)).toHaveLength(0)
    })

    it('generates a unique run_id per dispatch', async () => {
      sqsMock.on(SendMessageCommand).resolves({ MessageId: 'm-1' })

      await service.dispatchRun({
        type: 'district_issue_pulse',
        organizationSlug: 'org-1',
        clerkUserId: 'user_test_dispatch',
        params: {
          state: 'CA',
          city: 'San Francisco',
          l2DistrictType: 'city',
          l2DistrictName: 'San Francisco',
        },
      })
      await service.dispatchRun({
        type: 'district_issue_pulse',
        organizationSlug: 'org-1',
        clerkUserId: 'user_test_dispatch',
        params: {
          state: 'CA',
          city: 'San Francisco',
          l2DistrictType: 'city',
          l2DistrictName: 'San Francisco',
        },
      })

      const id1 = mockModel.create.mock.calls[0][0].data.runId as string
      const id2 = mockModel.create.mock.calls[1][0].data.runId as string
      expect(id1).not.toBe(id2)
    })
  })

  describe('sweepStaleRuns', () => {
    it('marks RUNNING rows older than 45 minutes as FAILED with a timeout error', async () => {
      mockModel.updateMany.mockResolvedValue({ count: 3 })

      await service.sweepStaleRuns()

      expect(mockModel.updateMany).toHaveBeenCalledWith({
        where: {
          status: { in: [ExperimentRunStatus.RUNNING] },
          updatedAt: { lt: expect.any(Date) },
        },
        data: {
          status: ExperimentRunStatus.FAILED,
          error: expect.stringContaining('45 minutes'),
        },
      })

      const cutoff = mockModel.updateMany.mock.calls[0][0].where.updatedAt
        .lt as Date
      const fortyFiveMinutesAgo = Date.now() - 45 * 60 * 1000
      expect(Math.abs(cutoff.getTime() - fortyFiveMinutesAgo)).toBeLessThan(
        5000,
      )
    })

    it('does not target terminal states', async () => {
      mockModel.updateMany.mockResolvedValue({ count: 0 })

      await service.sweepStaleRuns()

      const where = mockModel.updateMany.mock.calls[0][0].where as {
        status: { in: ExperimentRunStatus[] }
      }
      expect(where.status.in).toEqual([ExperimentRunStatus.RUNNING])
      expect(where.status.in).not.toContain(ExperimentRunStatus.COMPLETED)
      expect(where.status.in).not.toContain(ExperimentRunStatus.FAILED)
    })

    it('logs a warning with the swept count when rows are found', async () => {
      mockModel.updateMany.mockResolvedValue({ count: 2 })

      await service.sweepStaleRuns()

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ count: 2 }),
        expect.stringContaining('stale'),
      )
    })

    it('stays quiet when there is nothing to sweep', async () => {
      mockModel.updateMany.mockResolvedValue({ count: 0 })

      await service.sweepStaleRuns()

      expect(logger.warn).not.toHaveBeenCalled()
    })
  })

  describe('resumeRun', () => {
    const awaitingRun = {
      runId: 'run-abc-123',
      organizationSlug: 'org-1',
      experimentType: 'compliance_setup',
      status: ExperimentRunStatus.AWAITING_RESUME,
      params: { trigger: 'initial', clerk_user_id: 'user_clerk_123' },
      stage: 'domain_registration',
      resumeAttempts: 2,
    }

    it(
      'atomically claims the row and sends SQS with the same run_id ' +
        'and trigger=recovery_resume',
      async () => {
        sqsMock.on(SendMessageCommand).resolves({ MessageId: 'm-resume-1' })
        mockModel.updateMany.mockResolvedValue({ count: 1 })

        await service.resumeRun(awaitingRun)

        expect(mockModel.updateMany).toHaveBeenCalledWith({
          where: {
            runId: awaitingRun.runId,
            status: ExperimentRunStatus.AWAITING_RESUME,
          },
          data: {
            status: ExperimentRunStatus.RUNNING,
            resumeAttempts: { increment: 1 },
            resumeScheduledFor: null,
          },
        })

        const [call] = sqsMock.commandCalls(SendMessageCommand)
        expect(call).toBeDefined()
        const body = JSON.parse(
          call.args[0].input.MessageBody as string,
        ) as Record<string, unknown>
        expect(body.run_id).toBe(awaitingRun.runId)
        expect((body.params as Record<string, unknown>).trigger).toBe(
          'recovery_resume',
        )
        expect(body.clerk_user_id).toBe('user_clerk_123')
      },
    )

    it(
      'sends the clerk_user_id from params.clerk_user_id in the SQS body, ' +
        'not an empty string',
      async () => {
        sqsMock.on(SendMessageCommand).resolves({ MessageId: 'm-resume-2' })
        mockModel.updateMany.mockResolvedValue({ count: 1 })

        await service.resumeRun({
          runId: 'run-user-id-test',
          organizationSlug: 'org-1',
          experimentType: 'compliance_setup',
          params: { clerk_user_id: 'user_from_params' },
          stage: null,
          resumeAttempts: 0,
        })

        const [call] = sqsMock.commandCalls(SendMessageCommand)
        expect(call).toBeDefined()
        const body = JSON.parse(
          call.args[0].input.MessageBody as string,
        ) as Record<string, unknown>
        expect(body.clerk_user_id).toBe('user_from_params')
        expect(body.clerk_user_id).not.toBe('')
      },
    )

    it(
      'fails the run (guarded on AWAITING_RESUME) and sends no SQS ' +
        'message when params has no clerk_user_id',
      async () => {
        sqsMock.on(SendMessageCommand).resolves({ MessageId: 'm-resume-3' })
        mockModel.updateMany.mockResolvedValue({ count: 1 })

        await service.resumeRun({
          runId: 'run-missing-user',
          organizationSlug: 'org-1',
          experimentType: 'compliance_setup',
          params: { trigger: 'initial' },
          stage: null,
          resumeAttempts: 0,
        })

        expect(mockModel.updateMany).toHaveBeenCalledWith({
          where: {
            runId: 'run-missing-user',
            status: ExperimentRunStatus.AWAITING_RESUME,
          },
          data: {
            status: ExperimentRunStatus.FAILED,
            error: expect.stringContaining('clerk_user_id'),
          },
        })
        expect(mockModel.updateMany).not.toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              status: ExperimentRunStatus.RUNNING,
            }),
          }),
        )
        expect(sqsMock.commandCalls(SendMessageCommand)).toHaveLength(0)
        expect(logger.error).toHaveBeenCalledWith(
          expect.objectContaining({ runId: 'run-missing-user' }),
          expect.any(String),
        )
      },
    )

    it('does not send SQS when the atomic claim is lost (count 0)', async () => {
      sqsMock.on(SendMessageCommand).resolves({ MessageId: 'm-resume-1' })
      mockModel.updateMany.mockResolvedValue({ count: 0 })

      await service.resumeRun(awaitingRun)

      expect(sqsMock.commandCalls(SendMessageCommand)).toHaveLength(0)
    })

    it('releases the claim back to AWAITING_RESUME when SQS send throws', async () => {
      sqsMock.on(SendMessageCommand).rejects(new Error('SQS down'))
      mockModel.updateMany.mockResolvedValue({ count: 1 })

      await service.resumeRun(awaitingRun)

      expect(mockModel.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            runId: awaitingRun.runId,
            status: ExperimentRunStatus.RUNNING,
          },
          data: expect.objectContaining({
            status: ExperimentRunStatus.AWAITING_RESUME,
          }),
        }),
      )
    })

    it('does not send SQS when AGENT_DISPATCH_QUEUE_NAME is unset', async () => {
      delete process.env.AGENT_DISPATCH_QUEUE_NAME
      sqsMock.on(SendMessageCommand).resolves({ MessageId: 'm-1' })

      await service.resumeRun(awaitingRun)

      expect(sqsMock.commandCalls(SendMessageCommand)).toHaveLength(0)
      expect(mockModel.updateMany).not.toHaveBeenCalled()
    })

    it('resolves the queue url once and caches it across resumes', async () => {
      sqsMock.on(SendMessageCommand).resolves({ MessageId: 'm-1' })
      mockModel.updateMany.mockResolvedValue({ count: 1 })

      await service.resumeRun(awaitingRun)
      await service.resumeRun(awaitingRun)

      expect(sqsMock.commandCalls(GetQueueUrlCommand)).toHaveLength(1)
    })
  })

  describe('sweepResumableRuns', () => {
    const makeRun = (overrides: Record<string, unknown> = {}) => ({
      runId: 'run-sweep-1',
      organizationSlug: 'org-2',
      experimentType: 'compliance_setup',
      status: ExperimentRunStatus.AWAITING_RESUME,
      params: { trigger: 'initial', clerk_user_id: 'user_sweep' },
      stage: 'domain_registration',
      resumeAttempts: 0,
      resumeScheduledFor: new Date(Date.now() - 1000),
      ...overrides,
    })

    it('resumes due runs under the attempt cap', async () => {
      sqsMock.on(SendMessageCommand).resolves({ MessageId: 'm-1' })
      const run = makeRun({ resumeAttempts: 3 })
      mockModel.findMany.mockResolvedValue([run])
      mockModel.updateMany.mockResolvedValue({ count: 1 })

      await service.sweepResumableRuns()

      expect(mockModel.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: ExperimentRunStatus.AWAITING_RESUME,
            resumeScheduledFor: expect.objectContaining({
              lte: expect.any(Date),
            }),
          }),
          orderBy: { resumeScheduledFor: 'asc' },
          take: 100,
        }),
      )

      const sqsCalls = sqsMock.commandCalls(SendMessageCommand)
      expect(sqsCalls.length).toBeGreaterThan(0)
    })

    it(
      'sends the clerk_user_id from params in the SQS body when ' +
        'sweeper drives a resume',
      async () => {
        sqsMock.on(SendMessageCommand).resolves({ MessageId: 'm-sweep-clerk' })
        const run = makeRun({
          runId: 'run-sweep-clerk',
          params: { clerk_user_id: 'user_x', trigger: 'initial' },
          resumeAttempts: 1,
        })
        mockModel.findMany.mockResolvedValue([run])
        mockModel.updateMany.mockResolvedValue({ count: 1 })

        await service.sweepResumableRuns()

        const [call] = sqsMock.commandCalls(SendMessageCommand)
        expect(call).toBeDefined()
        const body = JSON.parse(
          call.args[0].input.MessageBody as string,
        ) as Record<string, unknown>
        expect(body.clerk_user_id).toBe('user_x')
        expect(body.clerk_user_id).not.toBe('')
      },
    )

    it(
      'does not claim or send SQS when the sweeper finds a run whose ' +
        'params have no clerk_user_id',
      async () => {
        sqsMock
          .on(SendMessageCommand)
          .resolves({ MessageId: 'm-sweep-no-user' })
        const run = makeRun({
          runId: 'run-sweep-no-user',
          params: { trigger: 'initial' },
          resumeAttempts: 1,
        })
        mockModel.findMany.mockResolvedValue([run])

        await service.sweepResumableRuns()

        expect(mockModel.updateMany).not.toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              status: ExperimentRunStatus.RUNNING,
            }),
          }),
        )
        expect(sqsMock.commandCalls(SendMessageCommand)).toHaveLength(0)
      },
    )

    it(
      'marks runs at/over the attempt cap as FAILED guarded on ' +
        'AWAITING_RESUME status',
      async () => {
        const capRun = makeRun({ resumeAttempts: 48 })
        mockModel.findMany.mockResolvedValue([capRun])
        mockModel.updateMany.mockResolvedValue({ count: 1 })

        await service.sweepResumableRuns()

        expect(mockModel.updateMany).toHaveBeenCalledWith({
          where: {
            runId: capRun.runId,
            status: ExperimentRunStatus.AWAITING_RESUME,
          },
          data: {
            status: ExperimentRunStatus.FAILED,
            error: expect.stringContaining('48'),
          },
        })
        expect(sqsMock.commandCalls(SendMessageCommand)).toHaveLength(0)
      },
    )
  })
})
