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
        experimentType: 'district_intel',
        organizationSlug: 'org-1',
        params: { foo: 'bar' },
      })

      expect(mockModel.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          runId: expect.any(String),
          experimentType: 'district_intel',
          organizationSlug: 'org-1',
          status: ExperimentRunStatus.RUNNING,
          params: { foo: 'bar' },
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
        params: { foo: 'bar' },
        organization_slug: 'org-1',
        experiment_type: 'district_intel',
        run_id: expect.any(String),
      })

      expect(result).toMatchObject({
        runId: expect.any(String),
        experimentType: 'district_intel',
        organizationSlug: 'org-1',
        status: ExperimentRunStatus.RUNNING,
      })
    })

    it('writes the same run_id to the DB row and the SQS message body', async () => {
      sqsMock.on(SendMessageCommand).resolves({ MessageId: 'm-1' })

      await service.dispatchRun({
        experimentType: 'district_intel',
        organizationSlug: 'org-1',
        params: {},
      })

      const dbRunId = mockModel.create.mock.calls[0][0].data.runId as string
      const [call] = sqsMock.commandCalls(SendMessageCommand)
      const body = JSON.parse(call.args[0].input.MessageBody as string) as {
        run_id: string
      }
      expect(body.run_id).toBe(dbRunId)
    })

    it('namespaces FIFO group per organization so runs for one org serialize', async () => {
      sqsMock.on(SendMessageCommand).resolves({ MessageId: 'm-1' })

      await service.dispatchRun({
        experimentType: 'a',
        organizationSlug: 'org-alpha',
        params: {},
      })
      await service.dispatchRun({
        experimentType: 'a',
        organizationSlug: 'org-beta',
        params: {},
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
          experimentType: 'district_intel',
          organizationSlug: 'org-1',
          params: {},
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
          experimentType: 'district_intel',
          organizationSlug: 'org-1',
          params: {},
        }),
      ).rejects.toThrow('db down')

      expect(sqsMock.commandCalls(SendMessageCommand)).toHaveLength(0)
    })

    it('generates a unique run_id per dispatch', async () => {
      sqsMock.on(SendMessageCommand).resolves({ MessageId: 'm-1' })

      await service.dispatchRun({
        experimentType: 'a',
        organizationSlug: 'org-1',
        params: {},
      })
      await service.dispatchRun({
        experimentType: 'a',
        organizationSlug: 'org-1',
        params: {},
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
          createdAt: { lt: expect.any(Date) },
        },
        data: {
          status: ExperimentRunStatus.FAILED,
          error: expect.stringContaining('45 minutes'),
        },
      })

      const cutoff = mockModel.updateMany.mock.calls[0][0].where.createdAt
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
})
