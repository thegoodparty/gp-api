import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ExperimentRunStatus } from '@prisma/client'
import { MeetingScheduleService } from './meetingSchedule.service'

const findFirst = vi.fn()
const getFile = vi.fn()

const makeService = () => {
  const svc = new MeetingScheduleService({ getFile } as never)
  ;(svc as unknown as { _prisma: object })._prisma = {
    experimentRun: { findFirst },
  }
  return svc
}

describe('MeetingScheduleService.loadLatestForOrg', () => {
  beforeEach(() => {
    findFirst.mockReset()
    getFile.mockReset()
  })

  it('returns null when no completed run exists', async () => {
    findFirst.mockResolvedValue(null)
    expect(await makeService().loadLatestForOrg('org-1')).toBeNull()
  })

  it('parses the found artifact', async () => {
    findFirst.mockResolvedValue({
      runId: 'run-1',
      status: ExperimentRunStatus.COMPLETED,
      artifactBucket: 'b',
      artifactKey: 'k',
    })
    getFile.mockResolvedValue(
      JSON.stringify({
        status: 'found',
        rrule: 'FREQ=MONTHLY;BYDAY=2MO,4MO',
        human: '2nd and 4th Monday',
        time: '19:00',
        timezone: 'America/Denver',
        duration_minutes: 180,
        sources: [{ url: 'https://example.gov' }],
      }),
    )
    const result = await makeService().loadLatestForOrg('org-1')
    expect(result).toMatchObject({
      status: 'found',
      rrule: 'FREQ=MONTHLY;BYDAY=2MO,4MO',
      duration_minutes: 180,
    })
  })

  it('parses a not_found artifact', async () => {
    findFirst.mockResolvedValue({
      runId: 'run-1',
      status: ExperimentRunStatus.COMPLETED,
      artifactBucket: 'b',
      artifactKey: 'k',
    })
    getFile.mockResolvedValue(
      JSON.stringify({ status: 'not_found', sources: [] }),
    )
    const result = await makeService().loadLatestForOrg('org-1')
    expect(result).toEqual({ status: 'not_found', sources: [] })
  })

  it('returns null when JSON is malformed', async () => {
    findFirst.mockResolvedValue({
      runId: 'run-1',
      status: ExperimentRunStatus.COMPLETED,
      artifactBucket: 'b',
      artifactKey: 'k',
    })
    getFile.mockResolvedValue('{"status":"bogus"}')
    expect(await makeService().loadLatestForOrg('org-1')).toBeNull()
  })

  it('returns null when S3 object is missing', async () => {
    findFirst.mockResolvedValue({
      runId: 'run-1',
      status: ExperimentRunStatus.COMPLETED,
      artifactBucket: 'b',
      artifactKey: 'k',
    })
    getFile.mockResolvedValue(undefined)
    expect(await makeService().loadLatestForOrg('org-1')).toBeNull()
  })
})
