import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ExperimentRunStatus, UserAgendaSource } from '@prisma/client'
import { useTestService } from '@/test-service'
import { S3Service } from '@/vendors/aws/services/s3.service'
import { ExperimentRunsService } from '@/agentExperiments/services/experimentRuns.service'
import { OrganizationsService } from '@/organizations/services/organizations.service'

const service = useTestService()

const orgHeader = (slug: string) => ({
  headers: { 'x-organization-slug': slug },
})

const seedOrgAndElectedOffice = async (orgSlug: string) => {
  await service.prisma.organization.create({
    data: { slug: orgSlug, ownerId: service.user.id },
  })
  await service.prisma.campaign.create({
    data: {
      userId: service.user.id,
      slug: `test-campaign-${orgSlug}`,
      organizationSlug: orgSlug,
      details: {},
    },
  })
  return service.prisma.electedOffice.create({
    data: { organizationSlug: orgSlug, userId: service.user.id },
  })
}

const mockS3 = (opts?: { objectExists?: boolean }) => {
  const s3 = service.app.get(S3Service)
  return {
    upload: vi
      .spyOn(s3, 'getSignedUrlForUpload')
      .mockResolvedValue('https://s3.example/upload-url'),
    view: vi
      .spyOn(s3, 'getSignedUrlForViewing')
      .mockResolvedValue('https://s3.example/view-url'),
    exists: vi
      .spyOn(s3, 'objectExists')
      .mockResolvedValue(opts?.objectExists ?? true),
  }
}

const mockResolveServeContext = () => {
  vi.spyOn(
    service.app.get(OrganizationsService),
    'resolveServeContext',
  ).mockResolvedValue({
    state: 'MN',
    positionName: 'City Council',
  })
}

const mockDispatchRun = () => {
  const runs = service.app.get(ExperimentRunsService)
  return vi.spyOn(runs, 'dispatchRun').mockImplementation(
    // dispatchRun normally creates the row, enqueues to SQS, returns the row.
    // We bypass SQS by creating the row directly and returning it.
    async (input) => {
      const runId = `test-run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      return service.prisma.experimentRun.create({
        data: {
          runId,
          experimentType: input.type,
          organizationSlug: input.organizationSlug,
          status: ExperimentRunStatus.RUNNING,
          params: input.params,
        },
      })
    },
  )
}

const mockHeadFetch = (
  status: number,
  contentType: string | null = 'application/pdf',
  contentLength: string | null = '1048576',
) => {
  return vi.spyOn(global, 'fetch').mockResolvedValue(
    new Response(null, {
      status,
      headers: {
        ...(contentType ? { 'content-type': contentType } : {}),
        ...(contentLength ? { 'content-length': contentLength } : {}),
      },
    }),
  )
}

beforeEach(() => {
  vi.stubEnv('AGENT_RUN_INPUTS_BUCKET', 'gp-agent-run-inputs-test')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('POST /v1/meetings/:date/briefing/agenda/presign', () => {
  it('returns a signed PUT URL with uploadId and uploadKey', async () => {
    const orgSlug = `presign-ok-${Date.now()}`
    await seedOrgAndElectedOffice(orgSlug)
    const s3 = mockS3()

    const result = await service.client.post(
      '/v1/meetings/2026-07-15/briefing/agenda/presign',
      { contentType: 'application/pdf', byteSize: 1_048_576 },
      orgHeader(orgSlug),
    )

    expect(result.status).toBe(201)
    expect(result.data).toMatchObject({
      uploadUrl: 'https://s3.example/upload-url',
    })
    expect(typeof result.data.uploadId).toBe('string')
    expect(result.data.uploadKey).toContain(
      `agendas/${result.data.uploadKey.split('/')[1]}/2026-07-15/`,
    )
    expect(s3.upload).toHaveBeenCalledOnce()
  })

  it('rejects byteSize over the 75 MB cap', async () => {
    const orgSlug = `presign-too-big-${Date.now()}`
    await seedOrgAndElectedOffice(orgSlug)
    mockS3()

    const result = await service.client.post(
      '/v1/meetings/2026-07-15/briefing/agenda/presign',
      { contentType: 'application/pdf', byteSize: 80 * 1024 * 1024 },
      orgHeader(orgSlug),
    )

    expect(result.status).toBe(400)
  })

  it('rejects non-PDF content types', async () => {
    const orgSlug = `presign-bad-type-${Date.now()}`
    await seedOrgAndElectedOffice(orgSlug)
    mockS3()

    const result = await service.client.post(
      '/v1/meetings/2026-07-15/briefing/agenda/presign',
      { contentType: 'image/png', byteSize: 1024 },
      orgHeader(orgSlug),
    )

    expect(result.status).toBe(400)
  })

  it('does NOT create a UserAgendaUpload row at presign time', async () => {
    const orgSlug = `presign-no-row-${Date.now()}`
    const eo = await seedOrgAndElectedOffice(orgSlug)
    mockS3()

    await service.client.post(
      '/v1/meetings/2026-07-15/briefing/agenda/presign',
      { contentType: 'application/pdf', byteSize: 1024 },
      orgHeader(orgSlug),
    )

    const rows = await service.prisma.userAgendaUpload.findMany({
      where: { electedOfficeId: eo.id },
    })
    expect(rows).toHaveLength(0)
  })
})

describe('POST /v1/meetings/:date/briefing/agenda — UPLOAD source', () => {
  it('creates the row, dispatches a briefing run, returns experimentRunId', async () => {
    const orgSlug = `finalize-upload-${Date.now()}`
    const eo = await seedOrgAndElectedOffice(orgSlug)
    mockResolveServeContext()
    mockS3({ objectExists: true })
    const dispatchSpy = mockDispatchRun()
    const uploadId = randomUUID()

    const result = await service.client.post(
      '/v1/meetings/2026-07-15/briefing/agenda',
      { source: 'UPLOAD', uploadId },
      orgHeader(orgSlug),
    )

    expect(result.status).toBe(201)
    expect(result.data).toMatchObject({ status: 'processing' })
    expect(typeof result.data.experimentRunId).toBe('string')

    const row = await service.prisma.userAgendaUpload.findUnique({
      where: {
        electedOfficeId_meetingDate: {
          electedOfficeId: eo.id,
          meetingDate: new Date('2026-07-15'),
        },
      },
    })
    expect(row).toMatchObject({
      source: UserAgendaSource.UPLOAD,
      // Server reconstructs the key from electedOffice.id + meetingDate +
      // uploadId — the client never supplies it.
      uploadKey: `agendas/${eo.id}/2026-07-15/${uploadId}.pdf`,
      experimentRunId: result.data.experimentRunId,
    })
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'meeting_briefing',
        params: expect.objectContaining({
          meetingDate: '2026-07-15',
          agendaPacketUrl: 'https://s3.example/view-url',
        }),
      }),
    )
  })

  it('rejects a non-UUID uploadId', async () => {
    const orgSlug = `finalize-bad-uuid-${Date.now()}`
    await seedOrgAndElectedOffice(orgSlug)
    mockS3()

    const result = await service.client.post(
      '/v1/meetings/2026-07-15/briefing/agenda',
      { source: 'UPLOAD', uploadId: 'not-a-uuid' },
      orgHeader(orgSlug),
    )

    expect(result.status).toBe(400)
  })

  it('rejects a client-supplied uploadKey (IDOR defense)', async () => {
    // additionalProperties on the discriminated union schema means any extra
    // fields the caller appends (including a cross-office uploadKey) are
    // rejected at the validation layer. Locks the contract: the server is
    // the only producer of the S3 key.
    const orgSlug = `finalize-extra-key-${Date.now()}`
    await seedOrgAndElectedOffice(orgSlug)
    mockS3()

    const result = await service.client.post(
      '/v1/meetings/2026-07-15/briefing/agenda',
      {
        source: 'UPLOAD',
        uploadId: randomUUID(),
        uploadKey: 'agendas/victim-office/2026-07-15/leaked.pdf',
      },
      orgHeader(orgSlug),
    )

    expect(result.status).toBe(400)
  })

  it('returns 400 when the S3 object does not exist', async () => {
    const orgSlug = `finalize-no-s3-${Date.now()}`
    await seedOrgAndElectedOffice(orgSlug)
    mockResolveServeContext()
    mockS3({ objectExists: false })
    mockDispatchRun()

    const result = await service.client.post(
      '/v1/meetings/2026-07-15/briefing/agenda',
      { source: 'UPLOAD', uploadId: randomUUID() },
      orgHeader(orgSlug),
    )

    expect(result.status).toBe(400)
  })

  it('re-finalizing replaces the prior row and dispatches a new run', async () => {
    const orgSlug = `finalize-reupload-${Date.now()}`
    const eo = await seedOrgAndElectedOffice(orgSlug)
    mockResolveServeContext()
    mockS3({ objectExists: true })
    mockDispatchRun()
    const firstId = randomUUID()
    const secondId = randomUUID()

    const first = await service.client.post(
      '/v1/meetings/2026-07-15/briefing/agenda',
      { source: 'UPLOAD', uploadId: firstId },
      orgHeader(orgSlug),
    )
    expect(first.status).toBe(201)

    const second = await service.client.post(
      '/v1/meetings/2026-07-15/briefing/agenda',
      { source: 'UPLOAD', uploadId: secondId },
      orgHeader(orgSlug),
    )
    expect(second.status).toBe(201)
    expect(second.data.experimentRunId).not.toBe(first.data.experimentRunId)

    const rows = await service.prisma.userAgendaUpload.findMany({
      where: { electedOfficeId: eo.id },
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].uploadKey).toBe(
      `agendas/${eo.id}/2026-07-15/${secondId}.pdf`,
    )
    expect(rows[0].experimentRunId).toBe(second.data.experimentRunId)
  })
})

describe('POST /v1/meetings/:date/briefing/agenda — URL source', () => {
  it('HEAD-checks the URL then dispatches with sourceUrl as agendaPacketUrl', async () => {
    const orgSlug = `finalize-url-${Date.now()}`
    const eo = await seedOrgAndElectedOffice(orgSlug)
    mockResolveServeContext()
    mockS3()
    const dispatchSpy = mockDispatchRun()
    const fetchSpy = mockHeadFetch(200, 'application/pdf', '524288')

    const result = await service.client.post(
      '/v1/meetings/2026-07-15/briefing/agenda',
      {
        source: 'URL',
        sourceUrl: 'https://example.gov/agendas/2026-07-15-packet.pdf',
      },
      orgHeader(orgSlug),
    )

    expect(result.status).toBe(201)
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://example.gov/agendas/2026-07-15-packet.pdf',
      expect.objectContaining({ method: 'HEAD' }),
    )

    const row = await service.prisma.userAgendaUpload.findUnique({
      where: {
        electedOfficeId_meetingDate: {
          electedOfficeId: eo.id,
          meetingDate: new Date('2026-07-15'),
        },
      },
    })
    expect(row).toMatchObject({
      source: UserAgendaSource.URL,
      sourceUrl: 'https://example.gov/agendas/2026-07-15-packet.pdf',
      contentType: 'application/pdf',
      byteSize: 524288,
    })
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({
          agendaPacketUrl: 'https://example.gov/agendas/2026-07-15-packet.pdf',
        }),
      }),
    )
  })

  it('returns 400 when HEAD returns 404', async () => {
    const orgSlug = `finalize-url-404-${Date.now()}`
    await seedOrgAndElectedOffice(orgSlug)
    mockHeadFetch(404)

    const result = await service.client.post(
      '/v1/meetings/2026-07-15/briefing/agenda',
      {
        source: 'URL',
        sourceUrl: 'https://example.gov/missing.pdf',
      },
      orgHeader(orgSlug),
    )

    expect(result.status).toBe(400)
  })

  it('returns 400 when HEAD returns a non-PDF content type', async () => {
    const orgSlug = `finalize-url-html-${Date.now()}`
    await seedOrgAndElectedOffice(orgSlug)
    mockHeadFetch(200, 'text/html')

    const result = await service.client.post(
      '/v1/meetings/2026-07-15/briefing/agenda',
      {
        source: 'URL',
        sourceUrl: 'https://example.gov/login-wall.html',
      },
      orgHeader(orgSlug),
    )

    expect(result.status).toBe(400)
  })

  it('returns 400 when content-length exceeds 75 MB', async () => {
    const orgSlug = `finalize-url-toobig-${Date.now()}`
    await seedOrgAndElectedOffice(orgSlug)
    mockHeadFetch(200, 'application/pdf', String(80 * 1024 * 1024))

    const result = await service.client.post(
      '/v1/meetings/2026-07-15/briefing/agenda',
      {
        source: 'URL',
        sourceUrl: 'https://example.gov/huge.pdf',
      },
      orgHeader(orgSlug),
    )

    expect(result.status).toBe(400)
  })
})

describe('GET /v1/meetings userAgendaStatus derivation', () => {
  it('returns null userAgendaStatus when no upload exists', async () => {
    const orgSlug = `gm-no-upload-${Date.now()}`
    await seedOrgAndElectedOffice(orgSlug)
    // Seed a schedule so the date appears in the meetings list at all.
    const scheduleRun = await service.prisma.experimentRun.create({
      data: {
        organizationSlug: orgSlug,
        experimentType: 'meeting_schedule',
        status: ExperimentRunStatus.COMPLETED,
        artifactBucket: 'schedule-bucket',
        artifactKey: 'schedule.json',
      },
    })
    vi.spyOn(service.app.get(S3Service), 'getFile').mockResolvedValue(
      JSON.stringify({
        status: 'found',
        rrule: 'FREQ=DAILY',
        time: '19:00',
        timezone: 'America/Chicago',
        duration_minutes: 120,
        meeting_name: 'City Council',
        location: 'Council Chambers',
        sources: [],
        generated_at: new Date().toISOString(),
        human: 'Daily',
      }),
    )
    expect(scheduleRun.runId).toBeTruthy()

    const result = await service.client.get('/v1/meetings', orgHeader(orgSlug))
    expect(result.status).toBe(200)
    for (const meeting of result.data.meetings) {
      expect(meeting.userAgendaStatus).toBeNull()
    }
  })

  it('surfaces processing/failed/completed from the linked ExperimentRun', async () => {
    const orgSlug = `gm-statuses-${Date.now()}`
    const eo = await seedOrgAndElectedOffice(orgSlug)
    // Schedule (FREQ=DAILY so several dates are projected)
    await service.prisma.experimentRun.create({
      data: {
        organizationSlug: orgSlug,
        experimentType: 'meeting_schedule',
        status: ExperimentRunStatus.COMPLETED,
        artifactBucket: 'schedule-bucket',
        artifactKey: 'schedule.json',
      },
    })
    vi.spyOn(service.app.get(S3Service), 'getFile').mockResolvedValue(
      JSON.stringify({
        status: 'found',
        rrule: 'FREQ=DAILY',
        time: '19:00',
        timezone: 'America/Chicago',
        duration_minutes: 120,
        meeting_name: 'City Council',
        location: 'Council Chambers',
        sources: [],
        generated_at: new Date().toISOString(),
        human: 'Daily',
      }),
    )

    // Three upload rows linked to runs at three different statuses.
    const today = new Date()
    const inDays = (n: number) => {
      const d = new Date(today)
      d.setUTCDate(d.getUTCDate() + n)
      d.setUTCHours(0, 0, 0, 0)
      return d
    }
    const seedUpload = async (date: Date, runStatus: ExperimentRunStatus) => {
      const run = await service.prisma.experimentRun.create({
        data: {
          organizationSlug: orgSlug,
          experimentType: 'meeting_briefing',
          status: runStatus,
        },
      })
      await service.prisma.userAgendaUpload.create({
        data: {
          electedOfficeId: eo.id,
          meetingDate: date,
          source: UserAgendaSource.UPLOAD,
          uploadBucket: 'gp-agent-run-inputs-test',
          uploadKey: `agendas/${eo.id}/x.pdf`,
          uploadedByUserId: service.user.id,
          experimentRunId: run.runId,
        },
      })
      return run.runId
    }
    await seedUpload(inDays(1), ExperimentRunStatus.RUNNING)
    await seedUpload(inDays(2), ExperimentRunStatus.FAILED)
    await seedUpload(inDays(3), ExperimentRunStatus.COMPLETED)

    const result = await service.client.get('/v1/meetings', orgHeader(orgSlug))
    expect(result.status).toBe(200)

    const byDate = new Map<string, string | null>()
    for (const m of result.data.meetings) {
      byDate.set(m.meetingDate, m.userAgendaStatus)
    }
    const iso = (d: Date) => d.toISOString().slice(0, 10)
    expect(byDate.get(iso(inDays(1)))).toBe('processing')
    expect(byDate.get(iso(inDays(2)))).toBe('failed')
    expect(byDate.get(iso(inDays(3)))).toBe('completed')
  })
})
