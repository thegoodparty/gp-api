import { describe, expect, it } from 'vitest'
import { MeetingProjectionService } from './meetingProjection.service'

const schedule = {
  status: 'found' as const,
  rrule: 'FREQ=MONTHLY;BYDAY=2MO,4MO',
  human: '2nd and 4th Monday',
  time: '19:00',
  timezone: 'America/Denver',
  durationMinutes: 180,
  sources: [],
}

describe('MeetingProjectionService.project', () => {
  const svc = new MeetingProjectionService()

  it('returns dates in chronological order', () => {
    const dates = svc.project({
      schedule,
      from: new Date('2026-05-01T00:00:00Z'),
      to: new Date('2026-07-31T00:00:00Z'),
    })
    expect(dates.length).toBeGreaterThan(0)
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i] >= dates[i - 1]).toBe(true)
    }
  })

  it('emits ISO date strings (YYYY-MM-DD)', () => {
    const dates = svc.project({
      schedule,
      from: new Date('2026-05-01T00:00:00Z'),
      to: new Date('2026-06-01T00:00:00Z'),
    })
    dates.forEach((d) => expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/))
  })

  it('projects 2nd and 4th Monday of May 2026 to the right local dates', () => {
    const dates = svc.project({
      schedule,
      from: new Date('2026-05-01T00:00:00Z'),
      to: new Date('2026-06-01T00:00:00Z'),
    })
    expect(dates).toEqual(['2026-05-11', '2026-05-25'])
  })

  it('emits local date in the schedule timezone, not UTC', () => {
    const honolulu = {
      ...schedule,
      time: '19:00',
      timezone: 'Pacific/Honolulu',
    }
    const dates = svc.project({
      schedule: honolulu,
      from: new Date('2026-05-01T00:00:00Z'),
      to: new Date('2026-06-01T00:00:00Z'),
    })
    expect(dates).toEqual(['2026-05-11', '2026-05-25'])
  })

  it('returns empty when status is not_found', () => {
    const dates = svc.project({
      schedule: { status: 'not_found', sources: [] },
      from: new Date('2026-05-01T00:00:00Z'),
      to: new Date('2026-06-01T00:00:00Z'),
    })
    expect(dates).toEqual([])
  })

  it('handles a weekly schedule', () => {
    const weekly = {
      ...schedule,
      rrule: 'FREQ=WEEKLY;BYDAY=TU',
      human: 'every Tuesday',
    }
    const dates = svc.project({
      schedule: weekly,
      from: new Date('2026-05-01T00:00:00Z'),
      to: new Date('2026-05-31T00:00:00Z'),
    })
    expect(dates).toEqual([
      '2026-05-05',
      '2026-05-12',
      '2026-05-19',
      '2026-05-26',
    ])
  })
})
