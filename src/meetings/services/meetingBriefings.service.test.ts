import { ExperimentRunStatus } from '@prisma/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ElectionsService } from '@/elections/services/elections.service'
import { ExperimentRunsService } from '@/agentExperiments/services/experimentRuns.service'
import { S3Service } from '@/vendors/aws/services/s3.service'
import { useTestService } from '@/test-service'
import { MeetingBriefingsService } from './meetingBriefings.service'

const service = useTestService()

const seedOrgAndCampaign = async (
  orgSlug: string,
  options: { positionId?: string } = {},
) => {
  await service.prisma.organization.create({
    data: {
      slug: orgSlug,
      ownerId: service.user.id,
      positionId: options.positionId ?? null,
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

describe('POST /v1/elected-office dispatches meeting_schedule', () => {
  beforeEach(() => {
    vi.stubEnv('MEETINGS_AUTOMATION_ENABLED', 'true')
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

  it('dispatches when org has a position', async () => {
    const orgSlug = `eo-create-${Date.now()}`
    await seedOrgAndCampaign(orgSlug, { positionId: 'br-pos-123' })

    vi.spyOn(
      service.app.get(ElectionsService),
      'getPositionById',
    ).mockResolvedValue({
      id: 'pos-real-id',
      brPositionId: 'br-pos-123',
      brDatabaseId: 'br-db-123',
      state: 'MN',
      name: 'City Council',
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

  it('does not dispatch briefing on schedule completion when MEETINGS_AUTOMATION_ENABLED is unset', async () => {
    vi.stubEnv('MEETINGS_AUTOMATION_ENABLED', '')
    const orgSlug = `eo-chain-gate-${Date.now()}`
    await seedOrgAndCampaign(orgSlug, { positionId: 'br-pos-chain-gate' })
    await service.prisma.electedOffice.create({
      data: { organizationSlug: orgSlug, userId: service.user.id },
    })
    const scheduleRun = await service.prisma.experimentRun.create({
      data: {
        organizationSlug: orgSlug,
        experimentType: 'meeting_schedule',
        status: ExperimentRunStatus.COMPLETED,
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

  it('dispatches meeting_briefing for the org after meeting_schedule completes', async () => {
    const orgSlug = `eo-chain-${Date.now()}`
    await seedOrgAndCampaign(orgSlug, { positionId: 'br-pos-chain' })
    await service.prisma.electedOffice.create({
      data: {
        organizationSlug: orgSlug,
        userId: service.user.id,
        campaignId: (
          await service.prisma.campaign.findFirst({
            where: { organizationSlug: orgSlug },
          })
        )?.id,
      },
    })
    vi.spyOn(
      service.app.get(ElectionsService),
      'getPositionById',
    ).mockResolvedValue({
      id: 'pos-real-id',
      brPositionId: 'br-pos-chain',
      brDatabaseId: 'br-db-chain',
      state: 'MN',
      name: 'City Council',
    })
    const scheduleRun = await service.prisma.experimentRun.create({
      data: {
        organizationSlug: orgSlug,
        experimentType: 'meeting_schedule',
        status: ExperimentRunStatus.COMPLETED,
      },
    })
    const dispatchSpy = vi
      .spyOn(service.app.get(ExperimentRunsService), 'dispatchRun')
      .mockResolvedValue(undefined)

    await service.app
      .get(MeetingBriefingsService)
      .onExperimentRunCompleted(scheduleRun)

    expect(dispatchSpy).toHaveBeenCalledTimes(1)
    expect(dispatchSpy).toHaveBeenCalledWith({
      type: 'meeting_briefing',
      organizationSlug: orgSlug,
      clerkUserId: service.user.clerkId!,
      params: {
        officialName: `${service.user.firstName} ${service.user.lastName}`,
        state: 'MN',
        positionName: 'City Council',
      },
    })
  })

  it('upserts MeetingBriefing row on briefing completion (reads date from artifact)', async () => {
    const orgSlug = `eo-upsert-${Date.now()}`
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
        briefing_status: 'briefing_ready',
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
    expect(row).not.toBeNull()
    expect(row?.artifactBucket).toBe('briefing-bucket')
    expect(row?.artifactKey).toBe('briefing.json')
    expect(row?.experimentRunId).toBe(briefingRun.runId)
    expect(row?.artifact?.meeting_name).toBe('City Council')
    expect(row?.artifact?.location).toBe('Council Chambers')
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
  beforeEach(() => {
    vi.stubEnv('MEETINGS_AUTOMATION_ENABLED', 'true')
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

  it('dispatches only for EOs without a future briefing', async () => {
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

    vi.spyOn(
      service.app.get(ElectionsService),
      'getPositionById',
    ).mockResolvedValue({
      id: 'pos-real-id',
      brPositionId: 'br-pos-cron',
      brDatabaseId: 'br-db-cron',
      state: 'MN',
      name: 'City Council',
    })

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
        }),
      }),
    )
  })
})

describe('MeetingBriefingsService.dispatchManual', () => {
  it('dispatches a schedule run regardless of the env gate', async () => {
    vi.stubEnv('MEETINGS_AUTOMATION_ENABLED', '')
    const orgSlug = `eo-manual-schedule-${Date.now()}`
    await seedOrgAndCampaign(orgSlug, { positionId: 'br-pos-manual-s' })
    const eo = await service.prisma.electedOffice.create({
      data: { organizationSlug: orgSlug, userId: service.user.id },
    })
    vi.spyOn(
      service.app.get(ElectionsService),
      'getPositionById',
    ).mockResolvedValue({
      id: 'pos-real-id',
      brPositionId: 'br-pos-manual-s',
      brDatabaseId: 'br-db-manual-s',
      state: 'MN',
      name: 'City Council',
    })
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

  it('dispatches a briefing run when kind is briefing', async () => {
    const orgSlug = `eo-manual-briefing-${Date.now()}`
    await seedOrgAndCampaign(orgSlug, { positionId: 'br-pos-manual-b' })
    const eo = await service.prisma.electedOffice.create({
      data: { organizationSlug: orgSlug, userId: service.user.id },
    })
    vi.spyOn(
      service.app.get(ElectionsService),
      'getPositionById',
    ).mockResolvedValue({
      id: 'pos-real-id',
      brPositionId: 'br-pos-manual-b',
      brDatabaseId: 'br-db-manual-b',
      state: 'MN',
      name: 'City Council',
    })
    const dispatchSpy = vi
      .spyOn(service.app.get(ExperimentRunsService), 'dispatchRun')
      .mockResolvedValue(undefined)

    const result = await service.app
      .get(MeetingBriefingsService)
      .dispatchManual(eo.id, 'briefing')

    expect(result.dispatched).toBe(true)
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'meeting_briefing' }),
    )
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
})
