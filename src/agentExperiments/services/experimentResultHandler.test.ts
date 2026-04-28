import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Message } from '@aws-sdk/client-sqs'
import { ExperimentRunStatus } from '@prisma/client'
import { PinoLogger } from 'nestjs-pino'
import { QueueType } from '@/queue/queue.types'
import { QueueConsumerService } from '@/queue/consumer/queueConsumer.service'
import { createMockLogger } from '@/shared/test-utils/mockLogger.util'

vi.mock('@/polls/utils/polls.utils', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  sendTevynAPIPollMessage: vi.fn(),
}))

const RUN_ID = 'run-abc'

type ResultOverrides = {
  runId?: string
  status?: 'success' | 'failed' | 'contract_violation' | string
  artifactKey?: string
  artifactBucket?: string
  durationSeconds?: number
  costUsd?: number
  error?: string
}

const makeMessage = (overrides: ResultOverrides = {}): Message => ({
  MessageId: 'msg-1',
  Body: JSON.stringify({
    type: QueueType.AGENT_EXPERIMENT_RESULT,
    data: {
      runId: RUN_ID,
      status: 'success',
      artifactKey: 'district_intel/run-abc/result.json',
      artifactBucket: 'gp-agent-artifacts-dev',
      durationSeconds: 42,
      costUsd: 0.18,
      ...overrides,
    },
  }),
})

const callModifier = async (
  mod: (run: Record<string, unknown>) => Promise<Record<string, unknown>>,
) =>
  mod({
    runId: RUN_ID,
    organizationSlug: 'org-1',
    experimentType: 'district_intel',
    status: ExperimentRunStatus.RUNNING,
    params: {},
    artifactKey: null,
    artifactBucket: null,
    durationSeconds: null,
    costUsd: null,
    error: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  })

describe('QueueConsumerService - handleAgentExperimentResult', () => {
  let service: QueueConsumerService
  let experimentRunsService: {
    findUnique: ReturnType<typeof vi.fn>
    optimisticLockingUpdate: ReturnType<typeof vi.fn>
  }
  let logger: PinoLogger

  beforeEach(() => {
    logger = createMockLogger()
    experimentRunsService = {
      findUnique: vi.fn().mockResolvedValue({
        runId: RUN_ID,
        status: ExperimentRunStatus.RUNNING,
        organizationSlug: 'org-1',
        experimentType: 'district_intel',
        updatedAt: new Date(),
      }),
      optimisticLockingUpdate: vi
        .fn()
        .mockImplementation(
          async (
            _params: unknown,
            mod: (
              run: Record<string, unknown>,
            ) => Promise<Record<string, unknown>>,
          ) => callModifier(mod),
        ),
    }

    service = new QueueConsumerService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      experimentRunsService as never,
      logger,
    )
  })

  it('transitions RUNNING -> COMPLETED on success, writes artifact + duration, and acks', async () => {
    const result = await service.processMessage(
      makeMessage({ status: 'success' }),
    )

    expect(result).toBe(true)
    expect(experimentRunsService.findUnique).toHaveBeenCalledWith({
      where: { runId: RUN_ID },
    })
    expect(experimentRunsService.optimisticLockingUpdate).toHaveBeenCalledWith(
      { where: { runId: RUN_ID } },
      expect.any(Function),
    )

    const [, modifier] = experimentRunsService.optimisticLockingUpdate.mock
      .calls[0] as [
      unknown,
      (run: Record<string, unknown>) => Promise<Record<string, unknown>>,
    ]
    const patched = await callModifier(modifier)
    expect(patched.status).toBe(ExperimentRunStatus.COMPLETED)
    expect(patched.artifactKey).toBe('district_intel/run-abc/result.json')
    expect(patched.artifactBucket).toBe('gp-agent-artifacts-dev')
    expect(patched.durationSeconds).toBe(42)
    expect(patched.costUsd).toBe(0.18)
    expect(patched.error).toBeNull()
  })

  it('modifier returns only writable scalars — no relation FKs or unique keys (would break Prisma update)', async () => {
    // Production failed with `Unknown argument organizationSlug` because the
    // modifier mutated and returned the entire row, including the relation
    // FK (organizationSlug) and unique key (runId). Prisma rejects those in
    // update.data. Lock the modifier output to only the columns this handler
    // is supposed to change.
    await service.processMessage(makeMessage({ status: 'success' }))

    const [, modifier] = experimentRunsService.optimisticLockingUpdate.mock
      .calls[0] as [
      unknown,
      (run: Record<string, unknown>) => Promise<Record<string, unknown>>,
    ]
    const patched = await callModifier(modifier)
    expect(patched).not.toHaveProperty('organizationSlug')
    expect(patched).not.toHaveProperty('runId')
    expect(patched).not.toHaveProperty('experimentType')
    expect(patched).not.toHaveProperty('createdAt')
    expect(patched).not.toHaveProperty('params')
  })

  it('maps "failed" to FAILED and preserves the error string', async () => {
    await service.processMessage(
      makeMessage({ status: 'failed', error: 'Agent crashed' }),
    )

    const [, modifier] = experimentRunsService.optimisticLockingUpdate.mock
      .calls[0] as [
      unknown,
      (run: Record<string, unknown>) => Promise<Record<string, unknown>>,
    ]
    const patched = await callModifier(modifier)
    expect(patched.status).toBe(ExperimentRunStatus.FAILED)
    expect(patched.error).toBe('Agent crashed')
  })

  it('collapses "contract_violation" to FAILED at the boundary', async () => {
    await service.processMessage(
      makeMessage({ status: 'contract_violation', error: 'missing field' }),
    )

    const [, modifier] = experimentRunsService.optimisticLockingUpdate.mock
      .calls[0] as [
      unknown,
      (run: Record<string, unknown>) => Promise<Record<string, unknown>>,
    ]
    const patched = await callModifier(modifier)
    expect(patched.status).toBe(ExperimentRunStatus.FAILED)
    expect(patched.error).toBe('missing field')
  })

  it('truncates error to 1000 chars to keep the column bounded', async () => {
    await service.processMessage(
      makeMessage({ status: 'failed', error: 'x'.repeat(2000) }),
    )

    const [, modifier] = experimentRunsService.optimisticLockingUpdate.mock
      .calls[0] as [
      unknown,
      (run: Record<string, unknown>) => Promise<Record<string, unknown>>,
    ]
    const patched = await callModifier(modifier)
    expect(typeof patched.error).toBe('string')
    expect((patched.error as string).length).toBe(1000)
  })

  it('acks and skips update when run does not exist (prevents DLQ loop)', async () => {
    experimentRunsService.findUnique.mockResolvedValue(null)

    const result = await service.processMessage(makeMessage())

    expect(result).toBe(true)
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ runId: RUN_ID }),
      }),
      'Experiment run not found',
    )
    expect(experimentRunsService.optimisticLockingUpdate).not.toHaveBeenCalled()
  })

  it('acks and skips update when run is already terminal COMPLETED', async () => {
    experimentRunsService.findUnique.mockResolvedValue({
      runId: RUN_ID,
      status: ExperimentRunStatus.COMPLETED,
      updatedAt: new Date(),
    })

    const result = await service.processMessage(makeMessage())

    expect(result).toBe(true)
    expect(logger.info).toHaveBeenCalledWith(
      { runId: RUN_ID },
      'Experiment run already completed, skipping',
    )
    expect(experimentRunsService.optimisticLockingUpdate).not.toHaveBeenCalled()
  })

  it('acks and skips update when run is already terminal FAILED', async () => {
    experimentRunsService.findUnique.mockResolvedValue({
      runId: RUN_ID,
      status: ExperimentRunStatus.FAILED,
      updatedAt: new Date(),
    })

    const result = await service.processMessage(makeMessage())

    expect(result).toBe(true)
    expect(experimentRunsService.optimisticLockingUpdate).not.toHaveBeenCalled()
  })

  it('rejects unknown status values at Zod parse', async () => {
    await expect(
      service.processMessage(makeMessage({ status: 'weird' })),
    ).rejects.toThrow()
    expect(experimentRunsService.findUnique).not.toHaveBeenCalled()
  })

  it('rejects messages missing runId at Zod parse', async () => {
    const message: Message = {
      MessageId: 'msg-1',
      Body: JSON.stringify({
        type: QueueType.AGENT_EXPERIMENT_RESULT,
        data: { status: 'success' },
      }),
    }
    await expect(service.processMessage(message)).rejects.toThrow()
    expect(experimentRunsService.findUnique).not.toHaveBeenCalled()
  })

  it('propagates errors from optimisticLockingUpdate', async () => {
    experimentRunsService.optimisticLockingUpdate.mockRejectedValue(
      new Error('db timeout'),
    )

    await expect(service.processMessage(makeMessage())).rejects.toThrow(
      'db timeout',
    )
  })
})
