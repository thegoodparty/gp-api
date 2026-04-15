import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ExperimentSweeperService } from './experimentSweeper.service'
import { ExperimentRunsService } from './experimentRuns.service'
import { createMockLogger } from '@/shared/test-utils/mockLogger.util'

describe('ExperimentSweeperService', () => {
  const updateMany = vi.fn()
  const experimentRunsService = {
    updateMany,
  } as unknown as ExperimentRunsService

  const logger = createMockLogger()

  let service: ExperimentSweeperService

  beforeEach(() => {
    service = new ExperimentSweeperService(experimentRunsService, logger)
  })

  it('marks PENDING/RUNNING runs older than 45 minutes as FAILED', async () => {
    updateMany.mockResolvedValue({ count: 3 })

    await service.sweepStaleRuns()

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        status: { in: ['PENDING', 'RUNNING'] },
        createdAt: { lt: expect.any(Date) },
      },
      data: {
        status: 'FAILED',
        error: expect.stringContaining('45 minutes'),
      },
    })

    const cutoff = updateMany.mock.calls[0][0].where.createdAt.lt as Date
    const fortyFiveMinutesAgo = Date.now() - 45 * 60 * 1000
    expect(Math.abs(cutoff.getTime() - fortyFiveMinutesAgo)).toBeLessThan(5000)
  })

  it('logs warning when stale runs are found', async () => {
    updateMany.mockResolvedValue({ count: 2 })

    await service.sweepStaleRuns()

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ count: 2 }),
      expect.stringContaining('stale'),
    )
  })

  it('does not log when no stale runs found', async () => {
    updateMany.mockResolvedValue({ count: 0 })

    await service.sweepStaleRuns()

    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('only targets PENDING and RUNNING runs, not SUCCESS', async () => {
    updateMany.mockResolvedValue({ count: 0 })

    await service.sweepStaleRuns()

    const whereClause = updateMany.mock.calls[0][0].where
    expect(whereClause.status).toEqual({ in: ['PENDING', 'RUNNING'] })
    expect(whereClause.status.in).not.toContain('SUCCESS')
    expect(whereClause.status.in).not.toContain('FAILED')
    expect(whereClause.status.in).not.toContain('STALE')
    expect(whereClause.status.in).not.toContain('CONTRACT_VIOLATION')
  })

  it('uses 45-minute threshold to accommodate agent timeout + cold start (Fix #5)', async () => {
    updateMany.mockResolvedValue({ count: 0 })

    await service.sweepStaleRuns()

    const cutoff = updateMany.mock.calls[0][0].where.createdAt.lt as Date
    const now = new Date()
    const diffMs = now.getTime() - cutoff.getTime()
    const diffMinutes = diffMs / (60 * 1000)
    expect(diffMinutes).toBeGreaterThan(44)
    expect(diffMinutes).toBeLessThan(46)
  })
})
