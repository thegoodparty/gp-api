import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AgentDispatchService } from './agentDispatch.service'
import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import { PinoLogger } from 'nestjs-pino'
import { ExperimentRunsService } from './experimentRuns.service'

const { mockSend } = vi.hoisted(() => ({
  mockSend: vi.fn(),
}))

vi.mock('sqs-producer', () => ({
  Producer: {
    create: () => ({ send: mockSend }),
  },
}))

describe('AgentDispatchService', () => {
  let service: AgentDispatchService
  let logger: PinoLogger
  let experimentRunsService: {
    model: { create: ReturnType<typeof vi.fn> }
    client: { experimentRun: { update: ReturnType<typeof vi.fn> } }
  }

  beforeEach(() => {
    vi.stubEnv('AWS_REGION', 'us-west-2')
    vi.stubEnv(
      'AGENT_DISPATCH_QUEUE_URL',
      'https://sqs.us-west-2.amazonaws.com/123/agent-dispatch-dev.fifo',
    )

    logger = createMockLogger()
    experimentRunsService = {
      model: {
        create: vi.fn().mockResolvedValue({
          id: 'mock-id',
          runId: 'mock-run-id',
          experimentId: 'voter_targeting',
          candidateId: 'candidate-1',
          status: 'PENDING',
        }),
      },
      client: {
        experimentRun: { update: vi.fn().mockResolvedValue({}) },
      },
    }
    mockSend.mockReset()

    service = new AgentDispatchService(
      logger,
      experimentRunsService as unknown as ExperimentRunsService,
    )
  })

  it('creates a run record and sends SQS dispatch message', async () => {
    mockSend.mockResolvedValue(undefined)

    const result = await service.dispatch({
      experimentId: 'voter_targeting',
      candidateId: 'candidate-1',
      params: { key: 'value' },
    })

    expect(experimentRunsService.model.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        experimentId: 'voter_targeting',
        candidateId: 'candidate-1',
        status: 'PENDING',
        params: { key: 'value' },
      }),
    })

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: 'agent-dispatch-candidate-1',
        body: expect.any(String),
      }),
    )

    const sentBody = JSON.parse(mockSend.mock.calls[0][0].body as string)
    expect(sentBody).toMatchObject({
      experiment_id: 'voter_targeting',
      candidate_id: 'candidate-1',
      run_id: result.runId,
      params: { key: 'value' },
    })

    expect(result.runId).toMatch(/^[0-9a-f-]{36}$/)
    expect(result).toMatchObject({
      experimentId: 'voter_targeting',
      candidateId: 'candidate-1',
      status: 'dispatched',
    })

    expect(experimentRunsService.model.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ runId: result.runId }),
    })
  })

  it('marks run as FAILED and throws when SQS send fails', async () => {
    mockSend.mockRejectedValue(new Error('SQS unavailable'))

    await expect(
      service.dispatch({
        experimentId: 'voter_targeting',
        candidateId: 'candidate-1',
        params: {},
      }),
    ).rejects.toThrow('Failed to dispatch experiment. Please try again.')

    expect(logger.error).toHaveBeenCalled()
    expect(
      experimentRunsService.client.experimentRun.update,
    ).toHaveBeenCalledWith({
      where: { runId: expect.any(String) },
      data: { status: 'FAILED', error: 'SQS dispatch failed' },
    })
  })

  it('does not send SQS message when DB create fails', async () => {
    experimentRunsService.model.create.mockRejectedValue(
      new Error('DB connection lost'),
    )

    await expect(
      service.dispatch({
        experimentId: 'voter_targeting',
        candidateId: 'candidate-1',
        params: {},
      }),
    ).rejects.toThrow('DB connection lost')

    expect(mockSend).not.toHaveBeenCalled()
  })

  it('generates a unique run_id per dispatch', async () => {
    mockSend.mockResolvedValue(undefined)

    const result1 = await service.dispatch({
      experimentId: 'voter_targeting',
      candidateId: 'c1',
      params: {},
    })
    const result2 = await service.dispatch({
      experimentId: 'voter_targeting',
      candidateId: 'c1',
      params: {},
    })

    expect(result1.runId).not.toBe(result2.runId)
  })
})
