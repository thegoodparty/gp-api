import { describe, expect, it, vi } from 'vitest'
import { ExperimentRunStatus } from '@prisma/client'
import { getDay, parseISO } from 'date-fns'
import { S3Service } from '@/vendors/aws/services/s3.service'
import { useTestService } from '@/test-service'

const service = useTestService()

const seedElectedOffice = async (orgSlug: string) => {
  await service.prisma.organization.create({
    data: { slug: orgSlug, ownerId: service.user.id },
  })
  return service.prisma.electedOffice.create({
    data: {
      organizationSlug: orgSlug,
      userId: service.user.id,
    },
  })
}

const seedScheduleRun = async (
  organizationSlug: string,
  options?: { artifactBucket?: string; artifactKey?: string },
) =>
  service.prisma.experimentRun.create({
    data: {
      organizationSlug,
      experimentType: 'meeting_schedule',
      status: ExperimentRunStatus.COMPLETED,
      artifactBucket: options?.artifactBucket ?? 'schedule-bucket',
      artifactKey: options?.artifactKey ?? 'schedule-key.json',
    },
  })

const foundSchedule = {
  status: 'found',
  rrule: 'FREQ=MONTHLY;BYDAY=2MO,4MO',
  human: '2nd and 4th Monday',
  time: '19:00',
  timezone: 'America/Denver',
  duration_minutes: 180,
  sources: [{ url: 'https://example.gov' }],
}

const mockS3 = (responses: Record<string, string | undefined>) => {
  const s3 = service.app.get(S3Service)
  vi.spyOn(s3, 'getFile').mockImplementation(
    async (_bucket, key) => responses[key],
  )
}

describe('GET /v1/meetings', () => {
  it('returns 404 when user has no elected office', async () => {
    const result = await service.client.get('/v1/meetings', {
      headers: { 'x-organization-slug': 'nonexistent' },
    })

    expect(result.status).toBe(404)
  })

  it('returns schedule_known:false when no completed schedule run exists', async () => {
    const orgSlug = 'eo-no-schedule'
    await seedElectedOffice(orgSlug)

    const result = await service.client.get('/v1/meetings', {
      headers: { 'x-organization-slug': orgSlug },
    })

    expect(result.status).toBe(200)
    expect(result.data).toEqual({ schedule_known: false, meetings: [] })
  })

  it('returns schedule_known:false when schedule artifact is not_found', async () => {
    const orgSlug = 'eo-not-found-schedule'
    await seedElectedOffice(orgSlug)
    await seedScheduleRun(orgSlug)
    mockS3({
      'schedule-key.json': JSON.stringify({
        status: 'not_found',
        sources: [],
      }),
    })

    const result = await service.client.get('/v1/meetings', {
      headers: { 'x-organization-slug': orgSlug },
    })

    expect(result.status).toBe(200)
    expect(result.data).toEqual({ schedule_known: false, meetings: [] })
  })

  it('returns projected meetings with has_briefing:false when no briefings exist', async () => {
    const orgSlug = 'eo-projected'
    await seedElectedOffice(orgSlug)
    await seedScheduleRun(orgSlug)
    mockS3({ 'schedule-key.json': JSON.stringify(foundSchedule) })

    const result = await service.client.get('/v1/meetings', {
      headers: { 'x-organization-slug': orgSlug },
    })

    expect(result.status).toBe(200)
    expect(result.data.schedule_known).toBe(true)
    expect(result.data.meetings.length).toBeGreaterThan(0)
    expect(
      result.data.meetings.every(
        (m: { has_briefing: boolean }) => m.has_briefing === false,
      ),
    ).toBe(true)
  })

  it('every returned item carries schedule time/timezone/duration', async () => {
    const orgSlug = 'eo-item-shape'
    await seedElectedOffice(orgSlug)
    await seedScheduleRun(orgSlug)
    mockS3({ 'schedule-key.json': JSON.stringify(foundSchedule) })

    const result = await service.client.get('/v1/meetings', {
      headers: { 'x-organization-slug': orgSlug },
    })

    expect(result.status).toBe(200)
    for (const m of result.data.meetings as Array<{
      meeting_date: string
      meeting_time: string
      meeting_timezone: string
      duration_minutes: number
    }>) {
      expect(m.meeting_time).toBe('19:00')
      expect(m.meeting_timezone).toBe('America/Denver')
      expect(m.duration_minutes).toBe(180)
      expect(m.meeting_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  it('emits the local date for early-morning schedules in a non-UTC timezone', async () => {
    const orgSlug = 'eo-tz'
    await seedElectedOffice(orgSlug)
    await seedScheduleRun(orgSlug)
    mockS3({
      'schedule-key.json': JSON.stringify({
        ...foundSchedule,
        time: '02:00',
        timezone: 'Pacific/Honolulu',
      }),
    })

    const result = await service.client.get('/v1/meetings', {
      headers: { 'x-organization-slug': orgSlug },
    })

    expect(result.status).toBe(200)
    const dates = (result.data.meetings as Array<{ meeting_date: string }>).map(
      (m) => m.meeting_date,
    )
    expect(dates.length).toBeGreaterThan(0)
    for (const d of dates) {
      const day = getDay(parseISO(d))
      expect(day).toBe(1)
    }
  })

  it('returns an empty meeting list when the schedule artifact has a garbage rrule', async () => {
    const orgSlug = 'eo-bad-rrule'
    await seedElectedOffice(orgSlug)
    await seedScheduleRun(orgSlug)
    mockS3({
      'schedule-key.json': JSON.stringify({
        ...foundSchedule,
        rrule: 'NOT A VALID RRULE STRING',
      }),
    })

    const result = await service.client.get('/v1/meetings', {
      headers: { 'x-organization-slug': orgSlug },
    })

    expect(result.status).toBe(200)
    expect(result.data).toEqual({ schedule_known: true, meetings: [] })
  })

  it('returns an empty meeting list when the schedule timezone is invalid', async () => {
    const orgSlug = 'eo-bad-tz'
    await seedElectedOffice(orgSlug)
    await seedScheduleRun(orgSlug)
    mockS3({
      'schedule-key.json': JSON.stringify({
        ...foundSchedule,
        timezone: 'Not/AReal_Zone',
      }),
    })

    const result = await service.client.get('/v1/meetings', {
      headers: { 'x-organization-slug': orgSlug },
    })

    expect(result.status).toBe(200)
    expect(result.data).toEqual({ schedule_known: true, meetings: [] })
  })

  it('handles a weekly schedule', async () => {
    const orgSlug = 'eo-weekly'
    await seedElectedOffice(orgSlug)
    await seedScheduleRun(orgSlug)
    mockS3({
      'schedule-key.json': JSON.stringify({
        ...foundSchedule,
        rrule: 'FREQ=WEEKLY;BYDAY=TU',
        human: 'every Tuesday',
      }),
    })

    const result = await service.client.get('/v1/meetings', {
      headers: { 'x-organization-slug': orgSlug },
    })

    expect(result.status).toBe(200)
    expect(result.data.meetings.length).toBeGreaterThan(0)
    for (const m of result.data.meetings as Array<{ meeting_date: string }>) {
      const day = getDay(parseISO(m.meeting_date))
      expect(day).toBe(2)
    }
  })

  it('marks dates with existing briefings as has_briefing:true', async () => {
    const orgSlug = 'eo-briefings'
    const eo = await seedElectedOffice(orgSlug)
    await seedScheduleRun(orgSlug)
    mockS3({ 'schedule-key.json': JSON.stringify(foundSchedule) })

    const probe = await service.client.get('/v1/meetings', {
      headers: { 'x-organization-slug': orgSlug },
    })
    const targetDate = (
      probe.data.meetings as Array<{ meeting_date: string }>
    )[0].meeting_date

    const briefingRun = await service.prisma.experimentRun.create({
      data: {
        organizationSlug: orgSlug,
        experimentType: 'meeting_briefing',
        status: ExperimentRunStatus.COMPLETED,
      },
    })
    await service.prisma.meetingBriefing.create({
      data: {
        electedOfficeId: eo.id,
        meetingDate: new Date(targetDate + 'T00:00:00Z'),
        meetingTime: '19:00',
        meetingTimezone: 'America/Denver',
        experimentRunId: briefingRun.runId,
        artifactBucket: 'briefing-bucket',
        artifactKey: 'briefing-key.json',
      },
    })

    const result = await service.client.get('/v1/meetings', {
      headers: { 'x-organization-slug': orgSlug },
    })

    expect(result.status).toBe(200)
    const meetings = result.data.meetings as Array<{
      meeting_date: string
      has_briefing: boolean
    }>
    expect(
      meetings.find((m) => m.meeting_date === targetDate)?.has_briefing,
    ).toBe(true)
    expect(
      meetings
        .filter((m) => m.meeting_date !== targetDate)
        .every((m) => !m.has_briefing),
    ).toBe(true)
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

const seedBriefing = async (
  eoId: string,
  orgSlug: string,
  options: {
    meetingDate: string
    artifactBucket: string
    artifactKey: string
  },
) => {
  const briefingRun = await service.prisma.experimentRun.create({
    data: {
      organizationSlug: orgSlug,
      experimentType: 'meeting_briefing',
      status: ExperimentRunStatus.COMPLETED,
    },
  })
  return service.prisma.meetingBriefing.create({
    data: {
      electedOfficeId: eoId,
      meetingDate: new Date(options.meetingDate + 'T00:00:00Z'),
      meetingTime: '19:00',
      meetingTimezone: 'America/Denver',
      experimentRunId: briefingRun.runId,
      artifactBucket: options.artifactBucket,
      artifactKey: options.artifactKey,
    },
  })
}

describe('GET /v1/meetings/:date/briefing', () => {
  it('returns 400 when date param is malformed', async () => {
    const orgSlug = 'eo-bad-date'
    await seedElectedOffice(orgSlug)

    const result = await service.client.get(
      '/v1/meetings/06-08-2026/briefing',
      { headers: { 'x-organization-slug': orgSlug } },
    )

    expect(result.status).toBe(400)
  })

  it('returns 404 when no briefing row exists for that date', async () => {
    const orgSlug = 'eo-missing-briefing'
    await seedElectedOffice(orgSlug)

    const result = await service.client.get(
      '/v1/meetings/2026-06-08/briefing',
      { headers: { 'x-organization-slug': orgSlug } },
    )

    expect(result.status).toBe(404)
  })

  it('returns 404 when S3 object is missing', async () => {
    const orgSlug = 'eo-missing-s3'
    const eo = await seedElectedOffice(orgSlug)
    await seedBriefing(eo.id, orgSlug, {
      meetingDate: '2026-06-08',
      artifactBucket: 'briefing-bucket',
      artifactKey: 'missing-key.json',
    })
    mockS3({ 'missing-key.json': undefined })

    const result = await service.client.get(
      '/v1/meetings/2026-06-08/briefing',
      { headers: { 'x-organization-slug': orgSlug } },
    )

    expect(result.status).toBe(404)
  })

  it('returns 404 when artifact JSON is malformed', async () => {
    const orgSlug = 'eo-bad-json'
    const eo = await seedElectedOffice(orgSlug)
    await seedBriefing(eo.id, orgSlug, {
      meetingDate: '2026-06-08',
      artifactBucket: 'briefing-bucket',
      artifactKey: 'bad-json.json',
    })
    mockS3({ 'bad-json.json': '{not valid json' })

    const result = await service.client.get(
      '/v1/meetings/2026-06-08/briefing',
      { headers: { 'x-organization-slug': orgSlug } },
    )

    expect(result.status).toBe(404)
  })

  it('returns 404 when artifact fails Zod validation', async () => {
    const orgSlug = 'eo-bad-shape'
    const eo = await seedElectedOffice(orgSlug)
    await seedBriefing(eo.id, orgSlug, {
      meetingDate: '2026-06-08',
      artifactBucket: 'briefing-bucket',
      artifactKey: 'bad-shape.json',
    })
    mockS3({
      'bad-shape.json': JSON.stringify({
        id: 'b1',
        status: 'briefing_ready',
      }),
    })

    const result = await service.client.get(
      '/v1/meetings/2026-06-08/briefing',
      { headers: { 'x-organization-slug': orgSlug } },
    )

    expect(result.status).toBe(404)
  })

  it('returns the parsed briefing artifact on success', async () => {
    const orgSlug = 'eo-success'
    const eo = await seedElectedOffice(orgSlug)
    await seedBriefing(eo.id, orgSlug, {
      meetingDate: '2026-06-08',
      artifactBucket: 'briefing-bucket',
      artifactKey: 'good.json',
    })
    mockS3({ 'good.json': JSON.stringify(validBriefingArtifact) })

    const result = await service.client.get(
      '/v1/meetings/2026-06-08/briefing',
      { headers: { 'x-organization-slug': orgSlug } },
    )

    expect(result.status).toBe(200)
    expect(result.data.slug).toBe('city-council-june-8-2026')
    expect(result.data.reading_time_minutes).toBe(8)
    expect(result.data.meeting.scheduled_at).toBe('2026-06-08T19:00:00-06:00')
  })
})
