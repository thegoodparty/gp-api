import { Injectable, NotFoundException } from '@nestjs/common'
import { formatInTimeZone } from 'date-fns-tz'
import { format, parseISO } from 'date-fns'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { S3Service } from '@/vendors/aws/services/s3.service'
import { renderBriefingPdf } from './briefingPdf.renderer'
import {
  BriefingArtifact,
  BriefingItem,
  BriefingType,
  RenderBriefingPdfOptions,
} from './briefingPdf.types'

const BRIEFING_TYPE_LABEL: Record<BriefingType, string> = {
  city_council_meeting: 'City Council meeting',
  county_legislature_meeting: 'County Legislature meeting',
  school_board_meeting: 'School Board meeting',
}

@Injectable()
export class BriefingPdfService extends createPrismaBase(
  MODELS.MeetingBriefing,
) {
  constructor(private readonly s3: S3Service) {
    super()
  }

  /**
   * Look up a briefing by its UUID, load its artifact from S3, and render a
   * PDF buffer. Throws `NotFoundException` if no row matches or the artifact
   * has been deleted from S3.
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
        electedOffice: {
          select: {
            organizationSlug: true,
            user: {
              select: { firstName: true, lastName: true, name: true },
            },
          },
        },
      },
    })
    if (!row) {
      throw new NotFoundException('briefing_not_found')
    }

    const raw = await this.s3.getFile(row.artifactBucket, row.artifactKey)
    if (!raw) {
      throw new NotFoundException('briefing_artifact_missing')
    }

    let artifact: BriefingArtifact
    try {
      artifact = parseArtifact(raw)
    } catch {
      throw new NotFoundException('briefing_artifact_invalid')
    }

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
    const preparedForLine = buildPreparedFor(row.electedOffice?.user)

    const liveBriefingUrl = liveBriefingBaseUrl
      ? `${liveBriefingBaseUrl.replace(/\/$/, '')}/dashboard/briefings/${meetingDateIso}`
      : undefined

    const options: RenderBriefingPdfOptions = {
      title,
      preparedForLine,
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

function buildPreparedFor(
  user:
    | { firstName: string | null; lastName: string | null; name: string | null }
    | null
    | undefined,
): string | undefined {
  if (!user) return undefined
  const first = user.firstName?.trim() ?? ''
  const last = user.lastName?.trim() ?? ''
  const full = [first, last].filter(Boolean).join(' ').trim()
  if (full) return full
  return user.name?.trim() || undefined
}

function buildFilename(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
  return `${slug || 'briefing'}.pdf`
}

function isBriefingType(value: unknown): value is BriefingType {
  return (
    value === 'city_council_meeting' ||
    value === 'county_legislature_meeting' ||
    value === 'school_board_meeting'
  )
}

function parseArtifact(raw: string): BriefingArtifact {
  // JSON.parse returns unknown — coerce to the renderer's structural view.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  const parsed = JSON.parse(raw) as BriefingArtifact
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('artifact is not an object')
  }
  if (!Array.isArray(parsed.items)) {
    throw new Error('artifact.items is missing')
  }
  if (!parsed.executive_summary) {
    throw new Error('artifact.executive_summary is missing')
  }
  return parsed
}

// Surface a small helper so the controller can validate the prisma row id
// belongs to a known briefing without re-querying.
export type FeaturedBriefingItem = BriefingItem
