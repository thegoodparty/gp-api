import { describe, expect, it, vi } from 'vitest'
import { ExperimentRunStatus } from '../../generated/prisma'
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

const mockS3 = (responses: Record<string, string | undefined>) => {
  const s3 = service.app.get(S3Service)
  vi.spyOn(s3, 'getFile').mockImplementation(
    async (_bucket, key) => responses[key],
  )
}

const validArtifact = {
  briefing_type: 'city_council_meeting',
  meeting_date: '2026-06-08',
  meeting_time: '19:00',
  meeting_timezone: 'America/Denver',
  meeting_name: 'City Council',
  location: 'City Hall Council Chambers',
  executive_summary: { lead_in: 'Summary of the meeting.' },
  items: [
    {
      id: 'i1',
      title: 'Featured item one',
      item_number: '1',
      tier: 'featured',
      display: { summary: 'Featured summary' },
    },
    {
      id: 'i2',
      title: 'Standard item',
      item_number: '2',
      tier: 'standard',
      display: { summary: '' },
    },
  ],
}

const SOME_VALID_UUIDV7 = '0192abcd-1234-7890-abcd-1234567890ab'

describe('GET /v1/briefings/:uuid', () => {
  it('returns 400 when uuid param is not a valid UUIDv7', async () => {
    const result = await service.client.get('/v1/briefings/not-a-uuid')
    expect(result.status).toBe(400)
  })

  it('returns 400 for a v4 UUID (we only accept v7 here)', async () => {
    // The handler uses `ParseUUIDPipe({ version: '7' })`, so a v4 should be
    // rejected before any DB lookup happens. This regression-locks the
    // version constraint that narrows the brute-force search space.
    const v4 = '11111111-1111-4111-8111-111111111111'
    const result = await service.client.get(`/v1/briefings/${v4}`)
    expect(result.status).toBe(400)
  })

  it('returns 404 when no briefing row matches the uuid', async () => {
    const result = await service.client.get(
      `/v1/briefings/${SOME_VALID_UUIDV7}`,
    )
    expect(result.status).toBe(404)
  })

  it('returns 404 when the briefing row exists but the S3 artifact is missing', async () => {
    const orgSlug = 'eo-pdf-missing-s3'
    const eo = await seedElectedOffice(orgSlug)
    const seeded = await seedBriefing(eo.id, orgSlug, {
      meetingDate: '2026-06-08',
      artifactBucket: 'briefing-bucket',
      artifactKey: 'missing.json',
    })
    mockS3({ 'missing.json': undefined })

    const result = await service.client.get(`/v1/briefings/${seeded.id}`)
    expect(result.status).toBe(404)
  })

  it('returns 404 when the S3 artifact JSON is malformed', async () => {
    const orgSlug = 'eo-pdf-bad-json'
    const eo = await seedElectedOffice(orgSlug)
    const seeded = await seedBriefing(eo.id, orgSlug, {
      meetingDate: '2026-06-08',
      artifactBucket: 'briefing-bucket',
      artifactKey: 'bad.json',
    })
    mockS3({ 'bad.json': '{ not valid json' })

    const result = await service.client.get(`/v1/briefings/${seeded.id}`)
    // We deliberately surface 404 (not 500) for malformed artifacts so an
    // attacker can't distinguish "unknown UUID" from "known UUID with
    // corrupt artifact" by status code. The renderer never runs.
    expect(result.status).toBe(404)
  })

  it('returns 404 when the artifact fails the Zod schema', async () => {
    const orgSlug = 'eo-pdf-bad-shape'
    const eo = await seedElectedOffice(orgSlug)
    const seeded = await seedBriefing(eo.id, orgSlug, {
      meetingDate: '2026-06-08',
      artifactBucket: 'briefing-bucket',
      artifactKey: 'bad-shape.json',
    })
    // Missing required `executive_summary` + `items`.
    mockS3({
      'bad-shape.json': JSON.stringify({ meeting_name: 'City Council' }),
    })

    const result = await service.client.get(`/v1/briefings/${seeded.id}`)
    expect(result.status).toBe(404)
  })

  it('returns a PDF buffer with proper Content-Type on the happy path', async () => {
    const orgSlug = 'eo-pdf-success'
    const eo = await seedElectedOffice(orgSlug)
    const seeded = await seedBriefing(eo.id, orgSlug, {
      meetingDate: '2026-06-08',
      artifactBucket: 'briefing-bucket',
      artifactKey: 'good.json',
    })
    mockS3({ 'good.json': JSON.stringify(validArtifact) })

    const result = await service.client.get(`/v1/briefings/${seeded.id}`, {
      responseType: 'arraybuffer',
    })

    expect(result.status).toBe(200)
    expect(result.headers['content-type']).toContain('application/pdf')

    // PDF magic bytes — confirms the renderer produced something pdfkit
    // would call a valid PDF, not just an empty StreamableFile.
    const buf = Buffer.from(result.data as ArrayBuffer)
    expect(buf.slice(0, 4).toString('latin1')).toBe('%PDF')
    // And it's not trivially small — a real briefing renders hundreds of KB.
    expect(buf.length).toBeGreaterThan(5_000)
  })

  it('emits an RFC 6266 Content-Disposition with a slugified filename', async () => {
    const orgSlug = 'eo-pdf-filename'
    const eo = await seedElectedOffice(orgSlug)
    const seeded = await seedBriefing(eo.id, orgSlug, {
      meetingDate: '2026-06-08',
      artifactBucket: 'briefing-bucket',
      artifactKey: 'good2.json',
    })
    mockS3({ 'good2.json': JSON.stringify(validArtifact) })

    const result = await service.client.get(`/v1/briefings/${seeded.id}`, {
      responseType: 'arraybuffer',
    })

    expect(result.status).toBe(200)
    const cd = result.headers['content-disposition'] as string
    expect(cd).toMatch(/^inline;/)
    expect(cd).toMatch(/filename="[^"]+\.pdf"/)
    // RFC 6266 `filename*=UTF-8''...` for non-ASCII support.
    expect(cd).toMatch(/filename\*=UTF-8''.+\.pdf/)
    // The slug carries the briefing-type label so a shared PDF is
    // self-descriptive in a downloads folder.
    expect(cd.toLowerCase()).toContain('city-council')
  })
})
