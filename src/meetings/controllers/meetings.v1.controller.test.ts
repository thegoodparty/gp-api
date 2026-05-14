import { describe, expect, it, vi } from 'vitest'
import { ElectedOffice } from '@prisma/client'
import { MeetingsV1Controller } from './meetings.v1.controller'
import { MeetingProjectionService } from '../services/meetingProjection.service'

const electedOffice = {
  id: 'eo-1',
  organizationSlug: 'org-1',
} as ElectedOffice

const foundSchedule = {
  status: 'found' as const,
  rrule: 'FREQ=MONTHLY;BYDAY=2MO,4MO',
  human: '2nd and 4th Monday',
  time: '19:00',
  timezone: 'America/Denver',
  durationMinutes: 180,
  sources: [],
}

const makeController = (overrides: {
  schedule?: unknown
  briefings?: Array<{ meetingDate: Date }>
  briefingRow?: {
    artifactBucket: string
    artifactKey: string
  } | null
  s3Body?: string
}) => {
  const schedules = {
    loadLatestForOrg: vi.fn().mockResolvedValue(overrides.schedule ?? null),
  }
  const meetingBriefings = {
    findMany: vi.fn().mockResolvedValue(overrides.briefings ?? []),
    model: {
      findUnique: vi
        .fn()
        .mockResolvedValue(
          overrides.briefingRow === undefined ? null : overrides.briefingRow,
        ),
    },
  }
  const s3 = {
    getFile: vi.fn().mockResolvedValue(overrides.s3Body),
  }
  return new MeetingsV1Controller(
    meetingBriefings as never,
    schedules as never,
    new MeetingProjectionService(),
    s3 as never,
  )
}

describe('MeetingsV1Controller.list', () => {
  it('returns scheduleKnown:false when no schedule exists', async () => {
    const ctrl = makeController({ schedule: null })
    const res = await ctrl.list(electedOffice)
    expect(res).toEqual({ scheduleKnown: false, meetings: [] })
  })

  it('returns scheduleKnown:false when schedule status is not_found', async () => {
    const ctrl = makeController({
      schedule: { status: 'not_found', sources: [] },
    })
    const res = await ctrl.list(electedOffice)
    expect(res).toEqual({ scheduleKnown: false, meetings: [] })
  })

  it('returns projected meetings with hasBriefing:false when no briefings exist', async () => {
    const ctrl = makeController({ schedule: foundSchedule, briefings: [] })
    const res = await ctrl.list(electedOffice)
    expect(res.scheduleKnown).toBe(true)
    expect(res.meetings.length).toBeGreaterThan(0)
    expect(
      res.meetings.every(
        (m: { hasBriefing: boolean }) => m.hasBriefing === false,
      ),
    ).toBe(true)
  })

  it('marks dates with existing briefings as hasBriefing:true', async () => {
    const projection = new MeetingProjectionService()
    const sampleDates = projection.project({
      schedule: foundSchedule,
      from: new Date(),
      to: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    })
    const flagged = sampleDates[0]
    const ctrl = makeController({
      schedule: foundSchedule,
      briefings: [{ meetingDate: new Date(flagged) }],
    })
    const res = await ctrl.list(electedOffice)
    expect(
      res.meetings.find((m) => m.meetingDate === flagged)?.hasBriefing,
    ).toBe(true)
    expect(
      res.meetings
        .filter((m) => m.meetingDate !== flagged)
        .every((m) => !m.hasBriefing),
    ).toBe(true)
  })

  it('every returned item carries schedule time/timezone/duration', async () => {
    const ctrl = makeController({ schedule: foundSchedule })
    const res = await ctrl.list(electedOffice)
    res.meetings.forEach((m) => {
      expect(m.meetingTime).toBe('19:00')
      expect(m.meetingTimezone).toBe('America/Denver')
      expect(m.durationMinutes).toBe(180)
      expect(m.meetingDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })
  })
})

const validBriefingArtifact = {
  id: 'b1',
  slug: 'city-council-june-8-2026',
  meeting_id: 'm1',
  title: 'City Council June 8, 2026',
  meeting_date: 'June 8, 2026',
  status: 'briefing_ready',
  reading_time_minutes: 8,
  generated_at: '2026-05-13T14:22:08Z',
  meeting: {
    id: 'm1',
    name: 'City Council',
    body: 'City Council',
    type: 'city_council',
    scheduled_at: '2026-06-08T19:00:00-06:00',
    location: 'Council Chambers',
  },
  executive_summary: 'Summary',
  agenda: [],
  action_items: [],
}

describe('MeetingsV1Controller.getBriefing', () => {
  it('throws 404 when no briefing row exists for that date', async () => {
    const ctrl = makeController({ briefingRow: null })
    await expect(
      ctrl.getBriefing(electedOffice, { date: '2026-06-08' }),
    ).rejects.toThrow('Not Found')
  })

  it('throws 404 when S3 object is missing', async () => {
    const ctrl = makeController({
      briefingRow: { artifactBucket: 'b', artifactKey: 'k' },
      s3Body: undefined,
    })
    await expect(
      ctrl.getBriefing(electedOffice, { date: '2026-06-08' }),
    ).rejects.toThrow('Not Found')
  })

  it('returns the parsed briefing artifact on success', async () => {
    const ctrl = makeController({
      briefingRow: { artifactBucket: 'b', artifactKey: 'k' },
      s3Body: JSON.stringify(validBriefingArtifact),
    })
    const res = await ctrl.getBriefing(electedOffice, { date: '2026-06-08' })
    expect(res.slug).toBe('city-council-june-8-2026')
    expect(res.readingTimeMinutes).toBe(8)
    expect(res.meeting.scheduledAt).toBe('2026-06-08T19:00:00-06:00')
  })
})
