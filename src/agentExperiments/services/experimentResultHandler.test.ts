import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import { PinoLogger } from 'nestjs-pino'
import type { Message } from '@aws-sdk/client-sqs'
import { QueueType } from '@/queue/queue.types'
import { QueueConsumerService } from '@/queue/consumer/queueConsumer.service'

vi.mock('@/polls/utils/polls.utils', async (importOriginal) => ({
  ...(await importOriginal()),
  sendTevynAPIPollMessage: vi.fn(),
}))

vi.mock('src/observability/grafana/otel.client', () => ({
  recordBlockedStateEvent: vi.fn(),
}))

const makeResultMessage = (data: Record<string, unknown>): Message => ({
  MessageId: 'msg-1',
  Body: JSON.stringify({
    type: QueueType.AGENT_EXPERIMENT_RESULT,
    data: {
      experimentId: 'hello_world',
      runId: 'run-123',
      organizationSlug: 'acme-for-mayor',
      status: 'success',
      artifactKey: 'hello_world/run-123/result.json',
      artifactBucket: 'gp-agent-artifacts-dev',
      durationSeconds: 42,
      ...data,
    },
  }),
})

describe('QueueConsumerService - handleAgentExperimentResult', () => {
  let processMessage: (message: Message) => Promise<boolean | undefined>
  let experimentRunsService: {
    findFirst: ReturnType<typeof vi.fn>
    client: {
      experimentRun: { update: ReturnType<typeof vi.fn> }
    }
  }
  let logger: PinoLogger

  beforeEach(async () => {
    logger = createMockLogger()

    experimentRunsService = {
      findFirst: vi.fn().mockResolvedValue({
        id: 'db-id-1',
        runId: 'run-123',
        experimentId: 'hello_world',
        status: 'PENDING',
      }),
      client: {
        experimentRun: { update: vi.fn().mockResolvedValue({}) },
      },
    }

    const service = new QueueConsumerService(
      {} as never, // aiContentService
      {} as never, // slackService
      {} as never, // analytics
      {} as never, // campaignsService
      {} as never, // aiGenerationService
      {} as never, // campaignTasksService
      {} as never, // tcrComplianceService
      {} as never, // domainsService
      {} as never, // pollsService
      {} as never, // pollIssuesService
      {} as never, // pollIndividualMessage
      {} as never, // electedOfficeService
      {} as never, // contactsService
      {} as never, // s3Service
      {} as never, // usersService
      {} as never, // organizationsService
      {} as never, // weeklyTasksDigestHandler
      experimentRunsService as never,
      logger,
    )

    processMessage = service.processMessage.bind(service)
  })

  it('updates experiment run on success result', async () => {
    const result = await processMessage(makeResultMessage({}))

    expect(experimentRunsService.findFirst).toHaveBeenCalledWith({
      where: { runId: 'run-123' },
    })

    expect(
      experimentRunsService.client.experimentRun.update,
    ).toHaveBeenCalledWith({
      where: { id: 'db-id-1', status: { in: ['PENDING', 'RUNNING'] } },
      data: {
        status: 'SUCCESS',
        artifactKey: 'hello_world/run-123/result.json',
        artifactBucket: 'gp-agent-artifacts-dev',
        durationSeconds: 42,
        error: undefined,
      },
    })

    expect(result).toBe(true)
  })

  it('maps failed status correctly', async () => {
    const result = await processMessage(
      makeResultMessage({ status: 'failed', error: 'Agent crashed' }),
    )

    expect(
      experimentRunsService.client.experimentRun.update,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'FAILED',
          error: 'Agent crashed',
        }),
      }),
    )

    expect(result).toBe(true)
  })

  it('maps contract_violation status correctly', async () => {
    await processMessage(makeResultMessage({ status: 'contract_violation' }))

    expect(
      experimentRunsService.client.experimentRun.update,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'CONTRACT_VIOLATION' }),
      }),
    )
  })

  it('logs error and returns true when run not found', async () => {
    experimentRunsService.findFirst.mockResolvedValue(null)

    const result = await processMessage(makeResultMessage({}))

    expect(
      experimentRunsService.client.experimentRun.update,
    ).not.toHaveBeenCalled()
    expect(logger.error).toHaveBeenCalled()
    expect(result).toBe(true)
  })

  it('ignores result for already-completed run', async () => {
    experimentRunsService.findFirst.mockResolvedValue({
      id: 'db-id-1',
      runId: 'run-123',
      status: 'SUCCESS',
    })

    const result = await processMessage(makeResultMessage({}))

    expect(
      experimentRunsService.client.experimentRun.update,
    ).not.toHaveBeenCalled()
    expect(result).toBe(true)
  })

  it('throws ZodError for unrecognized status values', async () => {
    await expect(
      processMessage(makeResultMessage({ status: 'unknown_status' })),
    ).rejects.toThrow()

    expect(
      experimentRunsService.client.experimentRun.update,
    ).not.toHaveBeenCalled()
    expect(experimentRunsService.findFirst).not.toHaveBeenCalled()
  })

  it('skips update when run is STALE (terminal guard)', async () => {
    experimentRunsService.findFirst.mockResolvedValue({
      id: 'db-id-1',
      runId: 'run-123',
      status: 'STALE',
    })

    const result = await processMessage(makeResultMessage({}))

    expect(
      experimentRunsService.client.experimentRun.update,
    ).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ runId: 'run-123' }),
      expect.stringContaining('already completed'),
    )
    expect(result).toBe(true)
  })

  it('skips update when run is CONTRACT_VIOLATION (terminal guard)', async () => {
    experimentRunsService.findFirst.mockResolvedValue({
      id: 'db-id-1',
      runId: 'run-123',
      status: 'CONTRACT_VIOLATION',
    })

    const result = await processMessage(makeResultMessage({}))

    expect(
      experimentRunsService.client.experimentRun.update,
    ).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ runId: 'run-123' }),
      expect.stringContaining('already completed'),
    )
    expect(result).toBe(true)
  })

  it('stores error message with contract_violation status', async () => {
    const contractError = 'Missing required field: score.total'
    await processMessage(
      makeResultMessage({ status: 'contract_violation', error: contractError }),
    )

    const updateCall =
      experimentRunsService.client.experimentRun.update.mock.calls[0][0]
    expect(updateCall.data.status).toBe('CONTRACT_VIOLATION')
    expect(updateCall.data.error).toBe(contractError)
  })

  it('truncates long error messages with contract_violation status', async () => {
    const longError = 'Contract violation: ' + 'x'.repeat(2000)
    await processMessage(
      makeResultMessage({ status: 'contract_violation', error: longError }),
    )

    const updateCall =
      experimentRunsService.client.experimentRun.update.mock.calls[0][0]
    expect(updateCall.data.status).toBe('CONTRACT_VIOLATION')
    expect(updateCall.data.error.length).toBeLessThanOrEqual(1000)
  })

  it('throws ZodError when experimentId is missing', async () => {
    const message: Message = {
      MessageId: 'msg-1',
      Body: JSON.stringify({
        type: QueueType.AGENT_EXPERIMENT_RESULT,
        data: {
          runId: 'run-123',
          organizationSlug: 'acme-for-mayor',
          status: 'success',
        },
      }),
    }

    await expect(processMessage(message)).rejects.toThrow()

    expect(
      experimentRunsService.client.experimentRun.update,
    ).not.toHaveBeenCalled()
  })

  it('throws ZodError when runId is missing', async () => {
    const message: Message = {
      MessageId: 'msg-1',
      Body: JSON.stringify({
        type: QueueType.AGENT_EXPERIMENT_RESULT,
        data: {
          experimentId: 'hello_world',
          organizationSlug: 'acme-for-mayor',
          status: 'success',
        },
      }),
    }

    await expect(processMessage(message)).rejects.toThrow()

    expect(
      experimentRunsService.client.experimentRun.update,
    ).not.toHaveBeenCalled()
  })

  it('throws ZodError when organizationSlug is missing', async () => {
    const message: Message = {
      MessageId: 'msg-1',
      Body: JSON.stringify({
        type: QueueType.AGENT_EXPERIMENT_RESULT,
        data: {
          experimentId: 'hello_world',
          runId: 'run-123',
          status: 'success',
        },
      }),
    }

    await expect(processMessage(message)).rejects.toThrow()

    expect(
      experimentRunsService.client.experimentRun.update,
    ).not.toHaveBeenCalled()
  })

  it('propagates error when DB update fails during status transition', async () => {
    experimentRunsService.client.experimentRun.update.mockRejectedValue(
      new Error('Connection refused'),
    )

    await expect(processMessage(makeResultMessage({}))).rejects.toThrow(
      'Connection refused',
    )
  })

  it('acknowledges message when sweeper already moved run to terminal state (P2025)', async () => {
    const p2025Error = Object.assign(
      new Error(
        'An operation failed because it depends on one or more records that were required but not found.',
      ),
      { code: 'P2025', name: 'PrismaClientKnownRequestError' },
    )
    experimentRunsService.client.experimentRun.update.mockRejectedValue(
      p2025Error,
    )

    const result = await processMessage(makeResultMessage({}))

    expect(result).toBe(true)
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ runId: 'run-123' }),
      expect.stringContaining('already transitioned'),
    )
  })

  it('uses conditional update to prevent sweeper race (Fix #4)', async () => {
    await processMessage(makeResultMessage({}))

    const updateCall =
      experimentRunsService.client.experimentRun.update.mock.calls[0][0]
    expect(updateCall.where).toEqual(
      expect.objectContaining({
        id: 'db-id-1',
        status: { in: ['PENDING', 'RUNNING'] },
      }),
    )
  })

  it('truncates long error messages to prevent DB bloat (Fix #6)', async () => {
    const longError = 'x'.repeat(2000)
    await processMessage(makeResultMessage({ status: 'failed', error: longError }))

    const updateCall =
      experimentRunsService.client.experimentRun.update.mock.calls[0][0]
    expect(updateCall.data.error.length).toBeLessThanOrEqual(1000)
  })
})
