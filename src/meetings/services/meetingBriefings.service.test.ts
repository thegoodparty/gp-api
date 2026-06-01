import { ExperimentRunStatus } from '@prisma/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OrganizationsService } from '@/organizations/services/organizations.service'
import { ExperimentRunsService } from '@/agentExperiments/services/experimentRuns.service'
import { S3Service } from '@/vendors/aws/services/s3.service'
import { useTestService } from '@/test-service'
import { MeetingBriefingsService } from './meetingBriefings.service'

const service = useTestService()

const seedOrgAndCampaign = async (
  orgSlug: string,
  options: {
    positionId?: string
    overrideDistrictId?: string
    customPositionName?: string
  } = {},
) => {
  await service.prisma.organization.create({
    data: {
      slug: orgSlug,
      ownerId: service.user.id,
      positionId: options.positionId ?? null,
      overrideDistrictId: options.overrideDistrictId ?? null,
      customPositionName: options.customPositionName ?? null,
    },
  })
  await service.prisma.campaign.create({
    data: {
      userId: service.user.id,
      slug: `test-campaign-${orgSlug}`,
      organizationSlug: orgSlug,
      details: {},
    },
  })
}

const mockS3 = (responses: Record<string, string | undefined>) => {
  vi.spyOn(service.app.get(S3Service), 'getFile').mockImplementation(
    async (_bucket, key) => responses[key],
  )
}

const mockResolveServeContext = (
  result: Awaited<ReturnType<OrganizationsService['resolveServeContext']>>,
) => {
  const spy = vi.spyOn(
    service.app.get(OrganizationsService),
    'resolveServeContext',
  )
  spy.mockResolvedValue(result)
  return spy
}

/**
 * Seed a meeting_schedule ExperimentRun and mock S3 to return its
 * artifact when the briefing service calls loadLatestScheduleForOrg.
 *
 * Defaults: FREQ=DAILY with time 23:59 in America/Chicago — guarantees
 * the schedule projects a meeting inside any reasonable test window so
 * the imminence gate passes. Tests that need a meeting OUTSIDE the
 * window can pass a long-interval RRULE explicitly.
 */
const seedScheduleForOrg = async (
  orgSlug: string,
  schedule: Partial<{
    status: 'found' | 'not_found'
    rrule: string
    time: string
    timezone: string
    duration_minutes: number
    meeting_name: string
    location: string
  }> = {},
) => {
  const artifactKey = `schedule-${orgSlug}.json`
  const body = {
    status: schedule.status ?? 'found',
    rrule: schedule.rrule ?? 'FREQ=DAILY',
    time: schedule.time ?? '23:59',
    timezone: schedule.timezone ?? 'America/Chicago',
    duration_minutes: schedule.duration_minutes ?? 120,
    meeting_name: schedule.meeting_name ?? 'City Council',
    location: schedule.location ?? 'Council Chambers',
    sources: [],
    generated_at: new Date().toISOString(),
    human: 'Daily test schedule',
  }
  await service.prisma.experimentRun.create({
    data: {
      organizationSlug: orgSlug,
      experimentType: 'meeting_schedule',
      status: ExperimentRunStatus.COMPLETED,
      artifactBucket: 'schedule-bucket',
      artifactKey,
    },
  })
  mockS3({ [artifactKey]: JSON.stringify(body) })
  return artifactKey
}

describe('POST /v1/elected-office dispatches schedule only (briefing chains via onExperimentRunCompleted)', () => {
  beforeEach(() => {
    vi.stubEnv('MEETINGS_AUTOMATION_ENABLED', 'true')
    mockResolveServeContext(null)
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('skips dispatch when MEETINGS_AUTOMATION_ENABLED is unset', async () => {
    vi.stubEnv('MEETINGS_AUTOMATION_ENABLED', '')
    const orgSlug = `eo-gate-${Date.now()}`
    await seedOrgAndCampaign(orgSlug, { positionId: 'br-pos-gate' })

    const dispatchSpy = vi
      .spyOn(service.app.get(ExperimentRunsService), 'dispatchRun')
      .mockResolvedValue(undefined)

    const res = await service.client.post(
      '/v1/elected-office',
      {},
      { headers: { 'x-organization-slug': orgSlug } },
    )

    expect(res.status).toBe(201)
    expect(dispatchSpy).not.toHaveBeenCalled()
  })

  it('dispatches meeting_schedule only (briefing fires later after the schedule completes)', async () => {
    const orgSlug = `eo-create-${Date.now()}`
    await seedOrgAndCampaign(orgSlug, { positionId: 'br-pos-123' })

    mockResolveServeContext({
      state: 'MN',
      positionName: 'City Council',
    })
    const dispatchSpy = vi
      .spyOn(service.app.get(ExperimentRunsService), 'dispatchRun')
      .mockResolvedValue(undefined)

    const res = await service.client.post(
      '/v1/elected-office',
      {},
      { headers: { 'x-organization-slug': orgSlug } },
    )

    expect(res.status).toBe(201)
    // Only the schedule fires on creation. The briefing is chained later
    // in onExperimentRunCompleted once the schedule lands and the
    // imminence gate confirms a meeting inside the 5-day window.
    expect(dispatchSpy).toHaveBeenCalledTimes(1)
    expect(dispatchSpy).toHaveBeenCalledWith({
      type: 'meeting_schedule',
      organizationSlug: expect.stringMatching(/^eo-/) as string,
      clerkUserId: service.user.clerkId!,
      params: {
        elected_office_id: res.data.id as string,
        state: 'MN',
        office: 'City Council',
      },
    })
  })

  it('does not dispatch when org has no position', async () => {
    const orgSlug = `eo-no-position-${Date.now()}`
    await seedOrgAndCampaign(orgSlug)

    const dispatchSpy = vi
      .spyOn(service.app.get(ExperimentRunsService), 'dispatchRun')
      .mockResolvedValue(undefined)

    const res = await service.client.post(
      '/v1/elected-office',
      {},
      { headers: { 'x-organization-slug': orgSlug } },
    )

    expect(res.status).toBe(201)
    expect(dispatchSpy).not.toHaveBeenCalled()
  })
})

describe('MeetingBriefingsService.onExperimentRunCompleted', () => {
  beforeEach(() => {
    vi.stubEnv('MEETINGS_AUTOMATION_ENABLED', 'true')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('chains a briefing dispatch when schedule completion shows a meeting inside the 5-day window', async () => {
    const orgSlug = `eo-chain-imminent-${Date.now()}`
    await seedOrgAndCampaign(orgSlug, { positionId: 'br-pos-chain-imminent' })
    const eo = await service.prisma.electedOffice.create({
      data: { organizationSlug: orgSlug, userId: service.user.id },
    })
    mockResolveServeContext({ state: 'MN', positionName: 'City Council' })
    const artifactKey = await seedScheduleForOrg(orgSlug) // FREQ=DAILY → always inside window
    const scheduleRun = await service.prisma.experimentRun.create({
      data: {
        organizationSlug: orgSlug,
        experimentType: 'meeting_schedule',
        status: ExperimentRunStatus.COMPLETED,
        artifactBucket: 'schedule-bucket',
        artifactKey,
        params: { elected_office_id: eo.id },
      },
    })
    const dispatchSpy = vi
      .spyOn(service.app.get(ExperimentRunsService), 'dispatchRun')
      .mockResolvedValue(undefined)

    await service.app
      .get(MeetingBriefingsService)
      .onExperimentRunCompleted(scheduleRun)

    expect(dispatchSpy).toHaveBeenCalledTimes(1)
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'meeting_briefing',
        params: expect.objectContaining({
          meetingDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) as string,
          meetingTime: '23:59',
          meetingTimezone: 'America/Chicago',
        }),
      }),
    )
  })

  it('does not chain a briefing when schedule completion shows no meeting inside the 5-day window', async () => {
    const orgSlug = `eo-chain-far-${Date.now()}`
    await seedOrgAndCampaign(orgSlug, { positionId: 'br-pos-chain-far' })
    const eo = await service.prisma.electedOffice.create({
      data: { organizationSlug: orgSlug, userId: service.user.id },
    })
    mockResolveServeContext({ state: 'MN', positionName: 'City Council' })
    // YEARLY with BYMONTH=1 + BYMONTHDAY=1 → next meeting on Jan 1 of next
    // year, which is virtually always outside a 5-day window.
    const artifactKey = await seedScheduleForOrg(orgSlug, {
      rrule: 'FREQ=YEARLY;BYMONTH=1;BYMONTHDAY=1',
    })
    const scheduleRun = await service.prisma.experimentRun.create({
      data: {
        organizationSlug: orgSlug,
        experimentType: 'meeting_schedule',
        status: ExperimentRunStatus.COMPLETED,
        artifactBucket: 'schedule-bucket',
        artifactKey,
        params: { elected_office_id: eo.id },
      },
    })
    const dispatchSpy = vi
      .spyOn(service.app.get(ExperimentRunsService), 'dispatchRun')
      .mockResolvedValue(undefined)

    await service.app
      .get(MeetingBriefingsService)
      .onExperimentRunCompleted(scheduleRun)

    expect(dispatchSpy).not.toHaveBeenCalled()
  })

  it('does not chain a briefing when schedule completion has status not_found', async () => {
    const orgSlug = `eo-chain-not-found-${Date.now()}`
    await seedOrgAndCampaign(orgSlug, { positionId: 'br-pos-chain-not-found' })
    const eo = await service.prisma.electedOffice.create({
      data: { organizationSlug: orgSlug, userId: service.user.id },
    })
    mockResolveServeContext({ state: 'MN', positionName: 'City Council' })
    const artifactKey = await seedScheduleForOrg(orgSlug, {
      status: 'not_found',
    })
    const scheduleRun = await service.prisma.experimentRun.create({
      data: {
        organizationSlug: orgSlug,
        experimentType: 'meeting_schedule',
        status: ExperimentRunStatus.COMPLETED,
        artifactBucket: 'schedule-bucket',
        artifactKey,
        params: { elected_office_id: eo.id },
      },
    })
    const dispatchSpy = vi
      .spyOn(service.app.get(ExperimentRunsService), 'dispatchRun')
      .mockResolvedValue(undefined)

    await service.app
      .get(MeetingBriefingsService)
      .onExperimentRunCompleted(scheduleRun)

    expect(dispatchSpy).not.toHaveBeenCalled()
  })

  it('upserts MeetingBriefing row on briefing completion (time + tz from artifact, no schedule needed)', async () => {
    const orgSlug = `eo-upsert-${Date.now()}`
    await service.prisma.organization.create({
      data: { slug: orgSlug, ownerId: service.user.id },
    })
    const eo = await service.prisma.electedOffice.create({
      data: { organizationSlug: orgSlug, userId: service.user.id },
    })
    const briefingRun = await service.prisma.experimentRun.create({
      data: {
        organizationSlug: orgSlug,
        experimentType: 'meeting_briefing',
        status: ExperimentRunStatus.COMPLETED,
        artifactBucket: 'briefing-bucket',
        artifactKey: 'briefing.json',
        params: { elected_office_id: eo.id },
      },
    })
    mockS3({
      'briefing.json': JSON.stringify({
        briefing_status: 'briefing_ready',
        meeting_date: '2026-06-08',
        meeting_time: '19:00',
        meeting_timezone: 'America/Chicago',
        meeting_name: 'City Council',
        location: 'Council Chambers',
      }),
    })

    await service.app
      .get(MeetingBriefingsService)
      .onExperimentRunCompleted(briefingRun)

    const row = await service.prisma.meetingBriefing.findUnique({
      where: {
        electedOfficeId_meetingDate: {
          electedOfficeId: eo.id,
          meetingDate: new Date('2026-06-08'),
        },
      },
    })
    expect(row).not.toBeNull()
    expect(row?.meetingTime).toBe('19:00')
    expect(row?.meetingTimezone).toBe('America/Chicago')
    expect(row?.artifactBucket).toBe('briefing-bucket')
    expect(row?.artifactKey).toBe('briefing.json')
    expect(row?.experimentRunId).toBe(briefingRun.runId)
    expect(row?.artifact?.meeting_name).toBe('City Council')
    expect(row?.artifact?.location).toBe('Council Chambers')
  })

  it('does not write a row when meeting_time is missing or malformed', async () => {
    const orgSlug = `eo-bad-time-${Date.now()}`
    await service.prisma.organization.create({
      data: { slug: orgSlug, ownerId: service.user.id },
    })
    const eo = await service.prisma.electedOffice.create({
      data: { organizationSlug: orgSlug, userId: service.user.id },
    })
    const briefingRun = await service.prisma.experimentRun.create({
      data: {
        organizationSlug: orgSlug,
        experimentType: 'meeting_briefing',
        status: ExperimentRunStatus.COMPLETED,
        artifactBucket: 'briefing-bucket',
        artifactKey: 'briefing.json',
        params: { elected_office_id: eo.id },
      },
    })
    mockS3({
      'briefing.json': JSON.stringify({
        briefing_status: 'briefing_ready',
        meeting_date: '2026-06-08',
        meeting_time: '7pm',
        meeting_timezone: 'America/Chicago',
      }),
    })

    await service.app
      .get(MeetingBriefingsService)
      .onExperimentRunCompleted(briefingRun)

    const row = await service.prisma.meetingBriefing.findUnique({
      where: {
        electedOfficeId_meetingDate: {
          electedOfficeId: eo.id,
          meetingDate: new Date('2026-06-08'),
        },
      },
    })
    expect(row).toBeNull()
  })

  it('does not write a row when meeting_timezone is missing', async () => {
    const orgSlug = `eo-no-tz-${Date.now()}`
    await service.prisma.organization.create({
      data: { slug: orgSlug, ownerId: service.user.id },
    })
    const eo = await service.prisma.electedOffice.create({
      data: { organizationSlug: orgSlug, userId: service.user.id },
    })
    const briefingRun = await service.prisma.experimentRun.create({
      data: {
        organizationSlug: orgSlug,
        experimentType: 'meeting_briefing',
        status: ExperimentRunStatus.COMPLETED,
        artifactBucket: 'briefing-bucket',
        artifactKey: 'briefing.json',
        params: { elected_office_id: eo.id },
      },
    })
    mockS3({
      'briefing.json': JSON.stringify({
        briefing_status: 'briefing_ready',
        meeting_date: '2026-06-08',
        meeting_time: '19:00',
      }),
    })

    await service.app
      .get(MeetingBriefingsService)
      .onExperimentRunCompleted(briefingRun)

    const row = await service.prisma.meetingBriefing.findUnique({
      where: {
        electedOfficeId_meetingDate: {
          electedOfficeId: eo.id,
          meetingDate: new Date('2026-06-08'),
        },
      },
    })
    expect(row).toBeNull()
  })

  it('does not write a MeetingBriefing row for placeholder briefing_status (awaiting_agenda)', async () => {
    const orgSlug = `eo-awaiting-${Date.now()}`
    await service.prisma.organization.create({
      data: { slug: orgSlug, ownerId: service.user.id },
    })
    const eo = await service.prisma.electedOffice.create({
      data: { organizationSlug: orgSlug, userId: service.user.id },
    })
    await service.prisma.experimentRun.create({
      data: {
        organizationSlug: orgSlug,
        experimentType: 'meeting_schedule',
        status: ExperimentRunStatus.COMPLETED,
        artifactBucket: 'schedule-bucket',
        artifactKey: 'schedule.json',
      },
    })
    const briefingRun = await service.prisma.experimentRun.create({
      data: {
        organizationSlug: orgSlug,
        experimentType: 'meeting_briefing',
        status: ExperimentRunStatus.COMPLETED,
        artifactBucket: 'briefing-bucket',
        artifactKey: 'briefing.json',
        params: { elected_office_id: eo.id },
      },
    })
    mockS3({
      'schedule.json': JSON.stringify({
        status: 'known',
        rrule: 'FREQ=WEEKLY;BYDAY=MO',
        time: '19:00',
        timezone: 'America/Chicago',
        duration_minutes: 60,
      }),
      'briefing.json': JSON.stringify({
        briefing_status: 'awaiting_agenda',
        meeting_date: '2026-06-08',
        meeting_name: 'City Council',
        location: 'Council Chambers',
      }),
    })

    await service.app
      .get(MeetingBriefingsService)
      .onExperimentRunCompleted(briefingRun)

    const row = await service.prisma.meetingBriefing.findUnique({
      where: {
        electedOfficeId_meetingDate: {
          electedOfficeId: eo.id,
          meetingDate: new Date('2026-06-08'),
        },
      },
    })
    expect(row).toBeNull()
  })

  it('does not write a MeetingBriefing row when briefing_status is error', async () => {
    const orgSlug = `eo-error-${Date.now()}`
    await service.prisma.organization.create({
      data: { slug: orgSlug, ownerId: service.user.id },
    })
    const eo = await service.prisma.electedOffice.create({
      data: { organizationSlug: orgSlug, userId: service.user.id },
    })
    await service.prisma.experimentRun.create({
      data: {
        organizationSlug: orgSlug,
        experimentType: 'meeting_schedule',
        status: ExperimentRunStatus.COMPLETED,
        artifactBucket: 'schedule-bucket',
        artifactKey: 'schedule.json',
      },
    })
    const briefingRun = await service.prisma.experimentRun.create({
      data: {
        organizationSlug: orgSlug,
        experimentType: 'meeting_briefing',
        status: ExperimentRunStatus.COMPLETED,
        artifactBucket: 'briefing-bucket',
        artifactKey: 'briefing.json',
        params: { elected_office_id: eo.id },
      },
    })
    mockS3({
      'schedule.json': JSON.stringify({
        status: 'known',
        rrule: 'FREQ=WEEKLY;BYDAY=MO',
        time: '19:00',
        timezone: 'America/Chicago',
        duration_minutes: 60,
      }),
      'briefing.json': JSON.stringify({
        briefing_status: 'error',
        meeting_date: '2026-06-08',
      }),
    })

    await service.app
      .get(MeetingBriefingsService)
      .onExperimentRunCompleted(briefingRun)

    const row = await service.prisma.meetingBriefing.findUnique({
      where: {
        electedOfficeId_meetingDate: {
          electedOfficeId: eo.id,
          meetingDate: new Date('2026-06-08'),
        },
      },
    })
    expect(row).toBeNull()
  })

  it('does not write a MeetingBriefing row when briefing_status is missing from the artifact', async () => {
    const orgSlug = `eo-missing-status-${Date.now()}`
    await service.prisma.organization.create({
      data: { slug: orgSlug, ownerId: service.user.id },
    })
    const eo = await service.prisma.electedOffice.create({
      data: { organizationSlug: orgSlug, userId: service.user.id },
    })
    await service.prisma.experimentRun.create({
      data: {
        organizationSlug: orgSlug,
        experimentType: 'meeting_schedule',
        status: ExperimentRunStatus.COMPLETED,
        artifactBucket: 'schedule-bucket',
        artifactKey: 'schedule.json',
      },
    })
    const briefingRun = await service.prisma.experimentRun.create({
      data: {
        organizationSlug: orgSlug,
        experimentType: 'meeting_briefing',
        status: ExperimentRunStatus.COMPLETED,
        artifactBucket: 'briefing-bucket',
        artifactKey: 'briefing.json',
        params: { elected_office_id: eo.id },
      },
    })
    mockS3({
      'schedule.json': JSON.stringify({
        status: 'known',
        rrule: 'FREQ=WEEKLY;BYDAY=MO',
        time: '19:00',
        timezone: 'America/Chicago',
        duration_minutes: 60,
      }),
      'briefing.json': JSON.stringify({
        meeting_date: '2026-06-08',
        meeting_name: 'City Council',
        location: 'Council Chambers',
      }),
    })

    await service.app
      .get(MeetingBriefingsService)
      .onExperimentRunCompleted(briefingRun)

    const row = await service.prisma.meetingBriefing.findUnique({
      where: {
        electedOfficeId_meetingDate: {
          electedOfficeId: eo.id,
          meetingDate: new Date('2026-06-08'),
        },
      },
    })
    expect(row).toBeNull()
  })

  it('skips when run is not COMPLETED', async () => {
    const orgSlug = `eo-running-${Date.now()}`
    await service.prisma.organization.create({
      data: { slug: orgSlug, ownerId: service.user.id },
    })
    const runningRun = await service.prisma.experimentRun.create({
      data: {
        organizationSlug: orgSlug,
        experimentType: 'meeting_schedule',
        status: ExperimentRunStatus.RUNNING,
      },
    })
    const dispatchSpy = vi
      .spyOn(service.app.get(ExperimentRunsService), 'dispatchRun')
      .mockResolvedValue(undefined)

    await service.app
      .get(MeetingBriefingsService)
      .onExperimentRunCompleted(runningRun)

    expect(dispatchSpy).not.toHaveBeenCalled()
  })
})

describe('MeetingBriefingsService.dispatchDailyBriefings', () => {
  beforeEach(async () => {
    vi.stubEnv('MEETINGS_AUTOMATION_ENABLED', 'true')
    mockResolveServeContext(null)
    // The cron claims a once-per-day lease; clear it so each test's first
    // invocation wins the claim (all tests run on the same UTC date).
    await service.prisma.cronRun.deleteMany({})
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('skips entirely when MEETINGS_AUTOMATION_ENABLED is unset', async () => {
    vi.stubEnv('MEETINGS_AUTOMATION_ENABLED', '')
    const dispatchSpy = vi
      .spyOn(service.app.get(ExperimentRunsService), 'dispatchRun')
      .mockResolvedValue(undefined)
    await service.app.get(MeetingBriefingsService).dispatchDailyBriefings()
    expect(dispatchSpy).not.toHaveBeenCalled()
  })

  it('dispatches only for EOs without a future briefing (and only when schedule shows imminent meeting)', async () => {
    const orgSlugA = `eo-cron-a-${Date.now()}`
    await seedOrgAndCampaign(orgSlugA, { positionId: 'br-pos-cron-a' })
    const campaignA = await service.prisma.campaign.findFirst({
      where: { organizationSlug: orgSlugA },
    })
    const eoA = await service.prisma.electedOffice.create({
      data: {
        organizationSlug: orgSlugA,
        userId: service.user.id,
        campaignId: campaignA?.id,
      },
    })

    const otherUser = await service.prisma.user.create({
      data: {
        clerkId: 'user_clerk_cron_b',
        email: `cron-b-${Date.now()}@test.example`,
        firstName: 'A',
        lastName: 'B',
      },
    })
    const orgSlugB = `eo-cron-b-${Date.now()}`
    await service.prisma.organization.create({
      data: {
        slug: orgSlugB,
        ownerId: otherUser.id,
        positionId: 'br-pos-cron-b',
      },
    })
    const campaignB = await service.prisma.campaign.create({
      data: {
        userId: otherUser.id,
        slug: `test-campaign-${orgSlugB}`,
        organizationSlug: orgSlugB,
        details: {},
      },
    })
    await service.prisma.electedOffice.create({
      data: {
        organizationSlug: orgSlugB,
        userId: otherUser.id,
        campaignId: campaignB.id,
      },
    })

    mockResolveServeContext({ state: 'MN', positionName: 'City Council' })

    // Both orgs have schedules so the imminence gate passes. Org A also has
    // an existing future briefing → coverage dedupe skips it. Only B fires.
    await seedScheduleForOrg(orgSlugA)
    await seedScheduleForOrg(orgSlugB)

    const existingBriefingRun = await service.prisma.experimentRun.create({
      data: {
        organizationSlug: orgSlugA,
        experimentType: 'meeting_briefing',
        status: ExperimentRunStatus.COMPLETED,
      },
    })
    await service.prisma.meetingBriefing.create({
      data: {
        electedOfficeId: eoA.id,
        meetingDate: new Date('2099-12-31'),
        meetingTime: '19:00',
        meetingTimezone: 'America/Denver',
        experimentRunId: existingBriefingRun.runId,
        artifactBucket: 'b',
        artifactKey: 'existing.json',
      },
    })

    const dispatchSpy = vi
      .spyOn(service.app.get(ExperimentRunsService), 'dispatchRun')
      .mockResolvedValue(undefined)

    await service.app.get(MeetingBriefingsService).dispatchDailyBriefings()

    expect(dispatchSpy).toHaveBeenCalledTimes(1)
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'meeting_briefing',
        organizationSlug: orgSlugB,
        params: expect.objectContaining({
          positionName: 'City Council',
          meetingDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) as string,
          meetingTime: '23:59',
          meetingTimezone: 'America/Chicago',
        }),
      }),
    )
  })

  it('skips an EO entirely when no meeting_schedule exists yet', async () => {
    const orgSlug = `eo-cron-no-schedule-${Date.now()}`
    await seedOrgAndCampaign(orgSlug, { positionId: 'br-pos-cron-no-sched' })
    const campaign = await service.prisma.campaign.findFirst({
      where: { organizationSlug: orgSlug },
    })
    await service.prisma.electedOffice.create({
      data: {
        organizationSlug: orgSlug,
        userId: service.user.id,
        campaignId: campaign?.id,
      },
    })
    mockResolveServeContext({ state: 'MN', positionName: 'City Council' })
    const dispatchSpy = vi
      .spyOn(service.app.get(ExperimentRunsService), 'dispatchRun')
      .mockResolvedValue(undefined)

    await service.app.get(MeetingBriefingsService).dispatchDailyBriefings()

    expect(dispatchSpy).not.toHaveBeenCalled()
  })

  it('skips an EO when the next meeting is outside the 5-day window', async () => {
    const orgSlug = `eo-cron-far-meeting-${Date.now()}`
    await seedOrgAndCampaign(orgSlug, { positionId: 'br-pos-cron-far' })
    const campaign = await service.prisma.campaign.findFirst({
      where: { organizationSlug: orgSlug },
    })
    await service.prisma.electedOffice.create({
      data: {
        organizationSlug: orgSlug,
        userId: service.user.id,
        campaignId: campaign?.id,
      },
    })
    mockResolveServeContext({ state: 'MN', positionName: 'City Council' })
    // YEARLY on Jan 1 → essentially never inside a 5-day window.
    await seedScheduleForOrg(orgSlug, {
      rrule: 'FREQ=YEARLY;BYMONTH=1;BYMONTHDAY=1',
    })
    const dispatchSpy = vi
      .spyOn(service.app.get(ExperimentRunsService), 'dispatchRun')
      .mockResolvedValue(undefined)

    await service.app.get(MeetingBriefingsService).dispatchDailyBriefings()

    expect(dispatchSpy).not.toHaveBeenCalled()
  })

  it('runs the dispatch loop once when invoked twice the same day (multi-replica guard)', async () => {
    const orgSlug = `eo-cron-guard-${Date.now()}`
    await seedOrgAndCampaign(orgSlug, { positionId: 'br-pos-cron-guard' })
    const campaign = await service.prisma.campaign.findFirst({
      where: { organizationSlug: orgSlug },
    })
    await service.prisma.electedOffice.create({
      data: {
        organizationSlug: orgSlug,
        userId: service.user.id,
        campaignId: campaign?.id,
      },
    })

    mockResolveServeContext({ state: 'MN', positionName: 'City Council' })
    await seedScheduleForOrg(orgSlug)

    const dispatchSpy = vi
      .spyOn(service.app.get(ExperimentRunsService), 'dispatchRun')
      .mockResolvedValue(undefined)

    const svc = service.app.get(MeetingBriefingsService)
    // Simulate both ECS replicas firing the cron on the same day. The second
    // invocation must lose the lease and skip the loop entirely.
    await svc.dispatchDailyBriefings()
    await svc.dispatchDailyBriefings()

    expect(dispatchSpy).toHaveBeenCalledTimes(1)
  })

  it('dispatches for EOs regardless of when they were created', async () => {
    const orgSlug = `eo-cron-old-${Date.now()}`
    await seedOrgAndCampaign(orgSlug, { positionId: 'br-pos-cron-old' })
    const campaign = await service.prisma.campaign.findFirst({
      where: { organizationSlug: orgSlug },
    })
    await service.prisma.electedOffice.create({
      data: {
        organizationSlug: orgSlug,
        userId: service.user.id,
        campaignId: campaign?.id,
        createdAt: new Date('2026-02-28T23:59:59.000Z'),
      },
    })

    mockResolveServeContext({ state: 'MN', positionName: 'City Council' })
    await seedScheduleForOrg(orgSlug)

    const dispatchSpy = vi
      .spyOn(service.app.get(ExperimentRunsService), 'dispatchRun')
      .mockResolvedValue(undefined)

    await service.app.get(MeetingBriefingsService).dispatchDailyBriefings()

    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'meeting_briefing',
        organizationSlug: orgSlug,
      }),
    )
  })
})

describe('MeetingBriefingsService.dispatchManual', () => {
  beforeEach(() => {
    mockResolveServeContext(null)
  })

  it('dispatches a schedule run regardless of the env gate', async () => {
    vi.stubEnv('MEETINGS_AUTOMATION_ENABLED', '')
    const orgSlug = `eo-manual-schedule-${Date.now()}`
    await seedOrgAndCampaign(orgSlug, { positionId: 'br-pos-manual-s' })
    const eo = await service.prisma.electedOffice.create({
      data: { organizationSlug: orgSlug, userId: service.user.id },
    })
    mockResolveServeContext({ state: 'MN', positionName: 'City Council' })
    const dispatchSpy = vi
      .spyOn(service.app.get(ExperimentRunsService), 'dispatchRun')
      .mockResolvedValue(undefined)

    const result = await service.app
      .get(MeetingBriefingsService)
      .dispatchManual(eo.id, 'schedule')

    expect(result.dispatched).toBe(true)
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'meeting_schedule' }),
    )
    vi.unstubAllEnvs()
  })

  it('dispatches a briefing run when kind is briefing (with meetingDate from schedule)', async () => {
    const orgSlug = `eo-manual-briefing-${Date.now()}`
    await seedOrgAndCampaign(orgSlug, { positionId: 'br-pos-manual-b' })
    const eo = await service.prisma.electedOffice.create({
      data: { organizationSlug: orgSlug, userId: service.user.id },
    })
    mockResolveServeContext({ state: 'MN', positionName: 'City Council' })
    await seedScheduleForOrg(orgSlug)
    const dispatchSpy = vi
      .spyOn(service.app.get(ExperimentRunsService), 'dispatchRun')
      .mockResolvedValue(undefined)

    const result = await service.app
      .get(MeetingBriefingsService)
      .dispatchManual(eo.id, 'briefing')

    expect(result.dispatched).toBe(true)
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'meeting_briefing',
        params: expect.objectContaining({
          meetingDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) as string,
          meetingTime: '23:59',
          meetingTimezone: 'America/Chicago',
        }),
      }),
    )
  })

  it('does not dispatch a briefing manually when no schedule exists', async () => {
    const orgSlug = `eo-manual-no-sched-${Date.now()}`
    await seedOrgAndCampaign(orgSlug, { positionId: 'br-pos-manual-no-sched' })
    const eo = await service.prisma.electedOffice.create({
      data: { organizationSlug: orgSlug, userId: service.user.id },
    })
    mockResolveServeContext({ state: 'MN', positionName: 'City Council' })
    const dispatchSpy = vi
      .spyOn(service.app.get(ExperimentRunsService), 'dispatchRun')
      .mockResolvedValue(undefined)

    const result = await service.app
      .get(MeetingBriefingsService)
      .dispatchManual(eo.id, 'briefing')

    expect(result.dispatched).toBe(false)
    expect(dispatchSpy).not.toHaveBeenCalled()
  })

  it('returns dispatched:false for unknown electedOfficeId', async () => {
    const dispatchSpy = vi
      .spyOn(service.app.get(ExperimentRunsService), 'dispatchRun')
      .mockResolvedValue(undefined)
    const result = await service.app
      .get(MeetingBriefingsService)
      .dispatchManual('not-a-real-id', 'schedule')
    expect(result.dispatched).toBe(false)
    expect(dispatchSpy).not.toHaveBeenCalled()
  })

  it('dispatches for override-only org (no positionId, overrideDistrictId + customPositionName set)', async () => {
    const orgSlug = `eo-override-${Date.now()}`
    await seedOrgAndCampaign(orgSlug, {
      overrideDistrictId: 'district-override-id',
      customPositionName: 'City Council Member',
    })
    const eo = await service.prisma.electedOffice.create({
      data: { organizationSlug: orgSlug, userId: service.user.id },
    })
    mockResolveServeContext({
      state: 'MN',
      positionName: 'City Council Member',
      l2DistrictType: 'City',
      l2DistrictName: 'Minneapolis',
    })
    await seedScheduleForOrg(orgSlug)
    const dispatchSpy = vi
      .spyOn(service.app.get(ExperimentRunsService), 'dispatchRun')
      .mockResolvedValue(undefined)

    const result = await service.app
      .get(MeetingBriefingsService)
      .dispatchManual(eo.id, 'briefing')

    expect(result.dispatched).toBe(true)
    expect(dispatchSpy).toHaveBeenCalledWith({
      type: 'meeting_briefing',
      organizationSlug: orgSlug,
      clerkUserId: service.user.clerkId!,
      params: {
        officialName: `${service.user.firstName} ${service.user.lastName}`,
        state: 'MN',
        positionName: 'City Council Member',
        meetingDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) as string,
        meetingTime: '23:59',
        meetingTimezone: 'America/Chicago',
        l2DistrictType: 'City',
        l2DistrictName: 'Minneapolis',
      },
    })
  })

  it('dispatches for position-based org (existing behavior: state + l2 from position)', async () => {
    const orgSlug = `eo-position-based-${Date.now()}`
    await seedOrgAndCampaign(orgSlug, { positionId: 'br-pos-based' })
    const eo = await service.prisma.electedOffice.create({
      data: { organizationSlug: orgSlug, userId: service.user.id },
    })
    mockResolveServeContext({
      state: 'CA',
      positionName: 'School Board',
      l2DistrictType: 'SchoolDistrict',
      l2DistrictName: 'LAUSD',
    })
    await seedScheduleForOrg(orgSlug)
    const dispatchSpy = vi
      .spyOn(service.app.get(ExperimentRunsService), 'dispatchRun')
      .mockResolvedValue(undefined)

    const result = await service.app
      .get(MeetingBriefingsService)
      .dispatchManual(eo.id, 'briefing')

    expect(result.dispatched).toBe(true)
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'meeting_briefing',
        params: expect.objectContaining({
          state: 'CA',
          positionName: 'School Board',
          l2DistrictType: 'SchoolDistrict',
          l2DistrictName: 'LAUSD',
          meetingDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) as string,
        }),
      }),
    )
  })

  it('skips dispatch when resolveServeContext returns null (neither position nor override)', async () => {
    const orgSlug = `eo-no-ctx-${Date.now()}`
    await seedOrgAndCampaign(orgSlug)
    const eo = await service.prisma.electedOffice.create({
      data: { organizationSlug: orgSlug, userId: service.user.id },
    })
    mockResolveServeContext(null)
    const dispatchSpy = vi
      .spyOn(service.app.get(ExperimentRunsService), 'dispatchRun')
      .mockResolvedValue(undefined)

    const result = await service.app
      .get(MeetingBriefingsService)
      .dispatchManual(eo.id, 'briefing')

    expect(result.dispatched).toBe(false)
    expect(dispatchSpy).not.toHaveBeenCalled()
  })
})
