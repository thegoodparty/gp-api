import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ExperimentRunStatus } from '../../generated/prisma'
import { ExperimentRunsService } from '@/agentExperiments/services/experimentRuns.service'
import { ElectionsService } from '@/elections/services/elections.service'
import { addDays, getDay, parseISO } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
import { S3Service } from '@/vendors/aws/services/s3.service'
import { parseIsoDateAsUTC } from '@/shared/util/date.util'
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
  meeting_name: 'City Council',
  location: 'City Hall Council Chambers, 200 Main St',
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

// Seed everything a briefing dispatch needs to resolve: org + position +
// elected office + a COMPLETED meeting_schedule artifact in S3 whose RRULE
// the caller controls (to land a meeting inside or outside the 5-day gate).
const seedBriefingTarget = async (orgSlug: string, rrule: string) => {
  await service.prisma.organization.create({
    data: { slug: orgSlug, ownerId: service.user.id, positionId: 'br-pos-g' },
  })
  await service.prisma.campaign.create({
    data: {
      userId: service.user.id,
      slug: `test-campaign-${orgSlug}`,
      organizationSlug: orgSlug,
      details: {},
    },
  })
  const eo = await service.prisma.electedOffice.create({
    data: { organizationSlug: orgSlug, userId: service.user.id },
  })
  vi.spyOn(
    service.app.get(ElectionsService),
    'getPositionById',
  ).mockResolvedValue({
    id: 'pos-real',
    brPositionId: 'br-pos-g',
    brDatabaseId: 'br-db-g',
    state: 'MN',
    name: 'City Council',
  })
  const artifactKey = `schedule-${orgSlug}.json`
  await service.prisma.experimentRun.create({
    data: {
      organizationSlug: orgSlug,
      experimentType: 'meeting_schedule',
      status: ExperimentRunStatus.COMPLETED,
      artifactBucket: 'schedule-bucket',
      artifactKey,
    },
  })
  mockS3({
    [artifactKey]: JSON.stringify({
      status: 'found',
      rrule,
      time: '23:59',
      timezone: 'America/Chicago',
      duration_minutes: 120,
      meeting_name: 'City Council',
      location: 'Council Chambers',
      sources: [],
      generated_at: new Date().toISOString(),
      human: 'test schedule',
    }),
  })
  return eo
}

describe('GET /v1/meetings', () => {
  it('returns 404 when user has no elected office', async () => {
    const result = await service.client.get('/v1/meetings', {
      headers: { 'x-organization-slug': 'nonexistent' },
    })

    expect(result.status).toBe(404)
  })

  it('returns scheduleKnown:false when no completed schedule run exists', async () => {
    const orgSlug = 'eo-no-schedule'
    await seedElectedOffice(orgSlug)

    const result = await service.client.get('/v1/meetings', {
      headers: { 'x-organization-slug': orgSlug },
    })

    expect(result.status).toBe(200)
    expect(result.data).toEqual({ scheduleKnown: false, meetings: [] })
  })

  it('returns scheduleKnown:false when schedule artifact is not_found', async () => {
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
    expect(result.data).toEqual({ scheduleKnown: false, meetings: [] })
  })

  it('returns projected meetings with hasBriefing:false when no briefings exist', async () => {
    const orgSlug = 'eo-projected'
    await seedElectedOffice(orgSlug)
    await seedScheduleRun(orgSlug)
    mockS3({ 'schedule-key.json': JSON.stringify(foundSchedule) })

    const result = await service.client.get('/v1/meetings', {
      headers: { 'x-organization-slug': orgSlug },
    })

    expect(result.status).toBe(200)
    expect(result.data.scheduleKnown).toBe(true)
    expect(result.data.meetings.length).toBeGreaterThan(0)
    expect(
      result.data.meetings.every(
        (m: { hasBriefing: boolean }) => m.hasBriefing === false,
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
      meetingDate: string
      meetingTime: string
      meetingTimezone: string
      durationMinutes: number
      meetingName: string
      location: string
    }>) {
      expect(m.meetingTime).toBe('19:00')
      expect(m.meetingTimezone).toBe('America/Denver')
      expect(m.durationMinutes).toBe(180)
      expect(m.meetingName).toBe('City Council')
      expect(m.location).toBe('City Hall Council Chambers, 200 Main St')
      expect(m.meetingDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
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
    const dates = (result.data.meetings as Array<{ meetingDate: string }>).map(
      (m) => m.meetingDate,
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
    expect(result.data).toEqual({ scheduleKnown: true, meetings: [] })
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
    expect(result.data).toEqual({ scheduleKnown: true, meetings: [] })
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
    for (const m of result.data.meetings as Array<{ meetingDate: string }>) {
      const day = getDay(parseISO(m.meetingDate))
      expect(day).toBe(2)
    }
  })

  it('marks dates with existing briefings as hasBriefing:true', async () => {
    const orgSlug = 'eo-briefings'
    const eo = await seedElectedOffice(orgSlug)
    await seedScheduleRun(orgSlug)
    mockS3({ 'schedule-key.json': JSON.stringify(foundSchedule) })

    const probe = await service.client.get('/v1/meetings', {
      headers: { 'x-organization-slug': orgSlug },
    })
    const targetDate = (
      probe.data.meetings as Array<{ meetingDate: string }>
    )[0].meetingDate

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
      meetingDate: string
      hasBriefing: boolean
    }>
    expect(
      meetings.find((m) => m.meetingDate === targetDate)?.hasBriefing,
    ).toBe(true)
    expect(
      meetings
        .filter((m) => m.meetingDate !== targetDate)
        .every((m) => !m.hasBriefing),
    ).toBe(true)
  })

  it('returns actual briefings even when no schedule is known', async () => {
    const orgSlug = 'eo-briefings-no-schedule'
    const eo = await seedElectedOffice(orgSlug)
    const briefingRun = await service.prisma.experimentRun.create({
      data: {
        organizationSlug: orgSlug,
        experimentType: 'meeting_briefing',
        status: ExperimentRunStatus.COMPLETED,
      },
    })
    const today = formatInTimeZone(new Date(), 'UTC', 'yyyy-MM-dd')
    await service.prisma.meetingBriefing.create({
      data: {
        electedOfficeId: eo.id,
        meetingDate: parseIsoDateAsUTC(today),
        meetingTime: '20:00',
        meetingTimezone: 'America/Chicago',
        experimentRunId: briefingRun.runId,
        artifactBucket: 'briefing-bucket',
        artifactKey: 'briefing-key.json',
      },
    })

    const result = await service.client.get('/v1/meetings', {
      headers: { 'x-organization-slug': orgSlug },
    })

    expect(result.status).toBe(200)
    expect(result.data.scheduleKnown).toBe(false)
    expect(result.data.meetings).toEqual([
      expect.objectContaining({
        meetingDate: today,
        meetingTime: '20:00',
        meetingTimezone: 'America/Chicago',
        hasBriefing: true,
      }),
    ])
  })

  it('uses artifact meeting_name and location when present', async () => {
    const orgSlug = 'eo-artifact-fields'
    const eo = await seedElectedOffice(orgSlug)
    await seedScheduleRun(orgSlug)
    mockS3({ 'schedule-key.json': JSON.stringify(foundSchedule) })

    const probe = await service.client.get('/v1/meetings', {
      headers: { 'x-organization-slug': orgSlug },
    })
    const targetDate = (
      probe.data.meetings as Array<{ meetingDate: string }>
    )[0].meetingDate

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
        artifact: {
          meeting_name: 'Special Session',
          location: 'Annex Hall, 42 Oak St',
        },
      },
    })

    const result = await service.client.get('/v1/meetings', {
      headers: { 'x-organization-slug': orgSlug },
    })

    expect(result.status).toBe(200)
    const target = (
      result.data.meetings as Array<{
        meetingDate: string
        meetingName: string
        location: string
        hasBriefing: boolean
      }>
    ).find((m) => m.meetingDate === targetDate)
    expect(target?.meetingName).toBe('Special Session')
    expect(target?.location).toBe('Annex Hall, 42 Oak St')
    expect(target?.hasBriefing).toBe(true)
  })

  it('falls back to schedule when artifact lacks meeting_name/location', async () => {
    const orgSlug = 'eo-artifact-empty'
    const eo = await seedElectedOffice(orgSlug)
    await seedScheduleRun(orgSlug)
    mockS3({ 'schedule-key.json': JSON.stringify(foundSchedule) })

    const probe = await service.client.get('/v1/meetings', {
      headers: { 'x-organization-slug': orgSlug },
    })
    const targetDate = (
      probe.data.meetings as Array<{ meetingDate: string }>
    )[0].meetingDate

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
        artifact: { meeting_name: '', location: '' },
      },
    })

    const result = await service.client.get('/v1/meetings', {
      headers: { 'x-organization-slug': orgSlug },
    })

    expect(result.status).toBe(200)
    const target = (
      result.data.meetings as Array<{
        meetingDate: string
        meetingName: string
        location: string
      }>
    ).find((m) => m.meetingDate === targetDate)
    expect(target?.meetingName).toBe('City Council')
    expect(target?.location).toBe('City Hall Council Chambers, 200 Main St')
  })

  it('returns ad-hoc briefings outside the projected RRULE dates', async () => {
    const orgSlug = 'eo-adhoc-briefing'
    const eo = await seedElectedOffice(orgSlug)
    await seedScheduleRun(orgSlug)
    mockS3({ 'schedule-key.json': JSON.stringify(foundSchedule) })

    const probe = await service.client.get('/v1/meetings', {
      headers: { 'x-organization-slug': orgSlug },
    })
    const projectedDates = new Set(
      (probe.data.meetings as Array<{ meetingDate: string }>).map(
        (m) => m.meetingDate,
      ),
    )

    let adhocDate = formatInTimeZone(new Date(), 'UTC', 'yyyy-MM-dd')
    while (projectedDates.has(adhocDate)) {
      adhocDate = formatInTimeZone(
        addDays(parseIsoDateAsUTC(adhocDate), 1),
        'UTC',
        'yyyy-MM-dd',
      )
    }

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
        meetingDate: parseIsoDateAsUTC(adhocDate),
        meetingTime: '20:00',
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
    const adhoc = (
      result.data.meetings as Array<{
        meetingDate: string
        hasBriefing: boolean
      }>
    ).find((m) => m.meetingDate === adhocDate)
    expect(adhoc).toBeDefined()
    expect(adhoc?.hasBriefing).toBe(true)
  })
})

const validBriefingArtifact = {
  id: 'b1',
  slug: 'city-council-june-8-2026',
  meetingId: 'm1',
  title: 'City Council June 8, 2026',
  meetingDate: 'June 8, 2026',
  status: 'briefing_ready',
  readingTimeMinutes: 8,
  generatedAt: '2026-05-13T14:22:08Z',
  meeting: {
    id: 'm1',
    name: 'City Council',
    body: 'City Council',
    type: 'city_council',
    scheduledAt: '2026-06-08T19:00:00-06:00',
    location: 'Council Chambers',
  },
  executiveSummary: 'Summary',
  agenda: [],
  actionItems: [],
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

  it('returns awaiting_agenda when no briefing row exists for that date', async () => {
    const orgSlug = 'eo-missing-briefing'
    await seedElectedOffice(orgSlug)

    const result = await service.client.get(
      '/v1/meetings/2026-06-08/briefing',
      { headers: { 'x-organization-slug': orgSlug } },
    )

    expect(result.status).toBe(200)
    expect(result.data.status).toBe('awaiting_agenda')
    expect(result.data.meetingDate).toBe('2026-06-08')
  })

  it('returns schedule info in awaiting_agenda when schedule is known', async () => {
    const orgSlug = 'eo-awaiting-with-schedule'
    await seedElectedOffice(orgSlug)
    await seedScheduleRun(orgSlug)
    mockS3({ 'schedule-key.json': JSON.stringify(foundSchedule) })

    const result = await service.client.get(
      '/v1/meetings/2026-06-08/briefing',
      { headers: { 'x-organization-slug': orgSlug } },
    )

    expect(result.status).toBe(200)
    expect(result.data).toEqual({
      status: 'awaiting_agenda',
      meetingDate: '2026-06-08',
      meetingName: foundSchedule.meeting_name,
      meetingTime: foundSchedule.time,
      meetingTimezone: foundSchedule.timezone,
      location: foundSchedule.location,
      durationMinutes: foundSchedule.duration_minutes,
    })
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

  it('returns the artifact JSON augmented with the Prisma row briefing_id', async () => {
    const orgSlug = 'eo-passthrough'
    const eo = await seedElectedOffice(orgSlug)
    const seeded = await seedBriefing(eo.id, orgSlug, {
      meetingDate: '2026-06-08',
      artifactBucket: 'briefing-bucket',
      artifactKey: 'partial.json',
    })
    mockS3({
      'partial.json': JSON.stringify({ id: 'b1', status: 'briefing_ready' }),
    })

    const result = await service.client.get(
      '/v1/meetings/2026-06-08/briefing',
      { headers: { 'x-organization-slug': orgSlug } },
    )

    expect(result.status).toBe(200)
    // The controller passes the artifact through verbatim and tacks the
    // Prisma row UUID onto it so the share URL can be built without a
    // second round-trip.
    expect(result.data).toEqual({
      id: 'b1',
      status: 'briefing_ready',
      briefing_id: seeded.id,
    })
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
    expect(result.data.readingTimeMinutes).toBe(8)
    expect(result.data.meeting.scheduledAt).toBe('2026-06-08T19:00:00-06:00')
  })
})

describe('POST /v1/meetings/briefings/dispatch', () => {
  beforeEach(() => {
    vi.stubEnv('MEETINGS_AUTOMATION_ENABLED', 'true')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns 400 when body is missing required fields', async () => {
    const result = await service.client.post(
      '/v1/meetings/briefings/dispatch',
      {},
    )
    expect(result.status).toBe(400)
  })

  it('returns 404 when elected office is not found', async () => {
    const result = await service.client.post(
      '/v1/meetings/briefings/dispatch',
      { electedOfficeId: 'nonexistent', kind: 'schedule' },
    )
    expect(result.status).toBe(404)
  })

  it('returns 200 and dispatches when admin sends a valid request', async () => {
    const orgSlug = `eo-dispatch-${Date.now()}`
    await service.prisma.organization.create({
      data: { slug: orgSlug, ownerId: service.user.id, positionId: 'br-pos-d' },
    })
    await service.prisma.campaign.create({
      data: {
        userId: service.user.id,
        slug: `test-campaign-${orgSlug}`,
        organizationSlug: orgSlug,
        details: {},
      },
    })
    const eo = await service.prisma.electedOffice.create({
      data: { organizationSlug: orgSlug, userId: service.user.id },
    })
    vi.spyOn(
      service.app.get(ElectionsService),
      'getPositionById',
    ).mockResolvedValue({
      id: 'pos-real',
      brPositionId: 'br-pos-d',
      brDatabaseId: 'br-db-d',
      state: 'MN',
      name: 'City Council',
    })
    const dispatchSpy = vi
      .spyOn(service.app.get(ExperimentRunsService), 'dispatchRun')
      .mockResolvedValue(undefined)

    const result = await service.client.post(
      '/v1/meetings/briefings/dispatch',
      { electedOfficeId: eo.id, kind: 'schedule' },
    )

    expect(result.status).toBe(201)
    expect(result.data).toEqual({ dispatched: true, kind: 'schedule' })
    expect(dispatchSpy).toHaveBeenCalledWith({
      type: 'meeting_schedule',
      organizationSlug: orgSlug,
      clerkUserId: service.user.clerkId!,
      params: {
        elected_office_id: eo.id,
        state: 'MN',
        office: 'City Council',
      },
    })
  })

  it('with useImminenceGate, dispatches a briefing when a meeting is inside the 5-day window', async () => {
    const orgSlug = `eo-gate-in-${Date.now()}`
    const eo = await seedBriefingTarget(orgSlug, 'FREQ=DAILY')
    const dispatchSpy = vi
      .spyOn(service.app.get(ExperimentRunsService), 'dispatchRun')
      .mockResolvedValue(undefined)

    const result = await service.client.post(
      '/v1/meetings/briefings/dispatch',
      { electedOfficeId: eo.id, kind: 'briefing', useImminenceGate: true },
    )

    expect(result.status).toBe(201)
    expect(result.data).toEqual({ dispatched: true, kind: 'briefing' })
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'meeting_briefing',
        organizationSlug: orgSlug,
      }),
    )
  })

  it('with useImminenceGate, returns 201 dispatched:false (no dispatch) when the next meeting is outside the 5-day window', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-06-01T12:00:00Z'))
    try {
      const orgSlug = `eo-gate-out-${Date.now()}`
      // Next occurrence is the 20th — ~19 days out: outside 5, inside 60.
      const eo = await seedBriefingTarget(orgSlug, 'FREQ=MONTHLY;BYMONTHDAY=20')
      const dispatchSpy = vi
        .spyOn(service.app.get(ExperimentRunsService), 'dispatchRun')
        .mockResolvedValue(undefined)

      const result = await service.client.post(
        '/v1/meetings/briefings/dispatch',
        { electedOfficeId: eo.id, kind: 'briefing', useImminenceGate: true },
      )

      expect(result.status).toBe(201)
      expect(result.data).toEqual({ dispatched: false, kind: 'briefing' })
      expect(dispatchSpy).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('without the gate, still dispatches that same out-of-window meeting (60-day manual window)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-06-01T12:00:00Z'))
    try {
      const orgSlug = `eo-nogate-${Date.now()}`
      const eo = await seedBriefingTarget(orgSlug, 'FREQ=MONTHLY;BYMONTHDAY=20')
      const dispatchSpy = vi
        .spyOn(service.app.get(ExperimentRunsService), 'dispatchRun')
        .mockResolvedValue(undefined)

      const result = await service.client.post(
        '/v1/meetings/briefings/dispatch',
        { electedOfficeId: eo.id, kind: 'briefing' },
      )

      expect(result.status).toBe(201)
      expect(result.data).toEqual({ dispatched: true, kind: 'briefing' })
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'meeting_briefing' }),
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('with useImminenceGate, skips when a future briefing already covers the official', async () => {
    const orgSlug = `eo-gate-dedupe-${Date.now()}`
    const eo = await seedBriefingTarget(orgSlug, 'FREQ=DAILY')
    const existingRun = await service.prisma.experimentRun.create({
      data: {
        organizationSlug: orgSlug,
        experimentType: 'meeting_briefing',
        status: ExperimentRunStatus.COMPLETED,
      },
    })
    await service.prisma.meetingBriefing.create({
      data: {
        electedOfficeId: eo.id,
        meetingDate: new Date('2099-12-31'),
        meetingTime: '19:00',
        meetingTimezone: 'America/Denver',
        experimentRunId: existingRun.runId,
        artifactBucket: 'b',
        artifactKey: 'existing.json',
      },
    })
    const dispatchSpy = vi
      .spyOn(service.app.get(ExperimentRunsService), 'dispatchRun')
      .mockResolvedValue(undefined)

    const result = await service.client.post(
      '/v1/meetings/briefings/dispatch',
      { electedOfficeId: eo.id, kind: 'briefing', useImminenceGate: true },
    )

    expect(result.status).toBe(201)
    expect(result.data).toEqual({ dispatched: false, kind: 'briefing' })
    expect(dispatchSpy).not.toHaveBeenCalled()
  })
})
