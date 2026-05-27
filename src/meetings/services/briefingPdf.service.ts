import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { formatInTimeZone } from 'date-fns-tz'
import { format, parseISO } from 'date-fns'
import { z } from 'zod'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { buildSlug } from 'src/shared/util/slug.util'
import { S3Service } from '@/vendors/aws/services/s3.service'
import { renderBriefingPdf } from './briefingPdf.renderer'
import {
  BriefingArtifact,
  BriefingType,
  RenderBriefingPdfOptions,
} from './briefingPdf.types'

const BRIEFING_TYPE_LABEL: Record<BriefingType, string> = {
  city_council_meeting: 'City Council meeting',
  county_legislature_meeting: 'County Legislature meeting',
  school_board_meeting: 'School Board meeting',
}

/**
 * Zod schema for the subset of `MeetingBriefingArtifact` the renderer
 * actually consumes. The artifact lives in S3 and is written by the agent
 * pipeline outside this service, so we validate the shape before handing it
 * to the renderer — a corrupted artifact would otherwise crash the renderer
 * mid-stream and surface as a 5xx on a public, unauthenticated endpoint.
 *
 * Fields the renderer doesn't touch (sources, claims, etc.) are intentionally
 * left out so the schema doesn't break every time the agent contract grows
 * a new optional field.
 */
const briefingItemNewsSchema = z.object({
  headline: z.string(),
  publication: z.string(),
})

const briefingItemDisplaySchema = z.object({
  summary: z.string(),
  budget_impact: z.object({ summary: z.string() }).nullable().optional(),
  constituent_sentiment: z
    .object({
      summary: z.string(),
      detail: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  recent_news: z.array(briefingItemNewsSchema).nullable().optional(),
  talking_points: z.array(z.string()).nullable().optional(),
})

const briefingItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  item_number: z.string().nullable(),
  tier: z.enum(['featured', 'queued', 'standard']),
  display: briefingItemDisplaySchema,
})

const briefingArtifactSchema = z.object({
  briefing_type: z.string().optional(),
  meeting_date: z.string().optional(),
  meeting_time: z.string().optional(),
  meeting_timezone: z.string().optional(),
  meeting_name: z.string().optional(),
  location: z.string().optional(),
  executive_summary: z.object({ lead_in: z.string() }),
  items: z.array(briefingItemSchema),
})

@Injectable()
export class BriefingPdfService extends createPrismaBase(
  MODELS.MeetingBriefing,
) {
  // The base class already provides a PinoLogger via `logger`; we wrap a
  // Nest `Logger` here so renderer-specific warnings show up under a clear
  // context tag without colliding with the inherited Prisma logger.
  private readonly renderLogger = new Logger(BriefingPdfService.name)

  constructor(private readonly s3: S3Service) {
    super()
  }

  /**
   * Look up a briefing by its UUID, load its artifact from S3, and render a
   * PDF buffer. All failure modes collapse to `NotFoundException()` (no
   * differentiated message) so the public endpoint doesn't leak whether a
   * UUID exists / its artifact is missing / its artifact is malformed.
   * Specific reasons are logged server-side via the Nest logger so operators
   * can still triage from the request id.
   */
  async renderById(
    briefingId: string,
    liveBriefingBaseUrl?: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const row = await this.model.findUnique({
      where: { id: briefingId },
      select: {
        meetingDate: true,
        meetingTime: true,
        meetingTimezone: true,
        artifactBucket: true,
        artifactKey: true,
      },
    })
    if (!row) {
      this.renderLogger.warn(`renderById: row not found for ${briefingId}`)
      throw new NotFoundException()
    }

    const raw = await this.s3.getFile(row.artifactBucket, row.artifactKey)
    if (!raw) {
      this.renderLogger.warn(
        `renderById: S3 artifact missing for ${briefingId} (s3://${row.artifactBucket}/${row.artifactKey})`,
      )
      throw new NotFoundException()
    }

    const artifact = parseArtifact(raw, this.renderLogger, briefingId)

    const meetingDateIso = formatInTimeZone(
      row.meetingDate,
      'UTC',
      'yyyy-MM-dd',
    )
    const briefingType = isBriefingType(artifact.briefing_type)
      ? artifact.briefing_type
      : null
    const title = buildTitle(briefingType, meetingDateIso)
    // Prefer the artifact fields (authoritative copy of what the agent wrote)
    // and fall back to the Prisma row for time/timezone, which gp-api also
    // persists separately on `meeting_briefing`.
    const meetingTime = artifact.meeting_time || row.meetingTime || undefined
    const meetingTimezone =
      artifact.meeting_timezone || row.meetingTimezone || undefined
    const meetingMetaLine = buildMeetingMetaLine(artifact, meetingDateIso, {
      meetingTime,
      meetingTimezone,
    })

    const liveBriefingUrl = liveBriefingBaseUrl
      ? `${liveBriefingBaseUrl.replace(/\/$/, '')}/dashboard/briefings/${meetingDateIso}`
      : undefined

    const options: RenderBriefingPdfOptions = {
      title,
      meetingMetaLine,
      liveBriefingUrl,
    }

    const buffer = await renderBriefingPdf(artifact, options)
    const filename = buildFilename(title)
    return { buffer, filename }
  }
}

function buildTitle(
  briefingType: BriefingType | null,
  meetingDateIso: string,
): string {
  const label = briefingType ? BRIEFING_TYPE_LABEL[briefingType] : 'Meeting'
  const formatted = format(parseISO(meetingDateIso), 'MMMM d, yyyy')
  return `${label} briefing for ${formatted}`
}

function buildMeetingMetaLine(
  artifact: BriefingArtifact,
  meetingDateIso: string,
  extras: { meetingTime?: string; meetingTimezone?: string },
): string {
  // Final shape: "City Council · Tue May 26 · 7:00 PM · City Hall — ...".
  // Each part is optional; pieces are joined with " · " so the line stays
  // compact whether or not the artifact has time/location.
  const parts: string[] = []
  if (artifact.meeting_name) parts.push(artifact.meeting_name)
  parts.push(formatMeetingDate(meetingDateIso))
  const formattedTime = formatMeetingTime(extras.meetingTime)
  if (formattedTime) parts.push(formattedTime)
  if (artifact.location) parts.push(artifact.location)
  return parts.filter(Boolean).join(' · ')
}

function formatMeetingDate(meetingDateIso: string): string {
  // Pin the parse to UTC noon so weekday formatting is timezone-stable on
  // the server. `meetingDateIso` is already `yyyy-MM-dd` in the meeting's
  // local timezone, so the calendar day is unambiguous.
  try {
    return format(parseISO(`${meetingDateIso}T12:00:00Z`), 'EEE MMM d')
  } catch {
    return meetingDateIso
  }
}

function formatMeetingTime(meetingTime: string | undefined): string {
  if (!meetingTime) return ''
  const [hhRaw, mmRaw] = meetingTime.split(':')
  const h24 = Number(hhRaw)
  const mm = mmRaw ?? ''
  if (!Number.isFinite(h24) || mm.length !== 2) return meetingTime
  const ampm = h24 >= 12 ? 'PM' : 'AM'
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h12}:${mm} ${ampm}`
}

function buildFilename(title: string): string {
  // Use the shared slug util (which wraps `slugify`) so the rules for
  // Unicode handling, separator collapse, etc. match every other slug we
  // emit. Falls back to "briefing" if the title is empty after slugging.
  const slug = buildSlug(title) || 'briefing'
  return `${slug}.pdf`
}

function isBriefingType(value: unknown): value is BriefingType {
  return (
    value === 'city_council_meeting' ||
    value === 'county_legislature_meeting' ||
    value === 'school_board_meeting'
  )
}

function parseArtifact(
  raw: string,
  logger: Logger,
  briefingId: string,
): BriefingArtifact {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    logger.warn(`parseArtifact: invalid JSON for ${briefingId}: ${message}`)
    throw new NotFoundException()
  }
  const result = briefingArtifactSchema.safeParse(parsed)
  if (!result.success) {
    logger.warn(
      `parseArtifact: schema mismatch for ${briefingId}: ${result.error.message}`,
    )
    throw new NotFoundException()
  }
  return result.data
}
