import { randomUUID } from 'node:crypto'
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common'
import { ElectedOffice, UserAgendaSource } from '../../generated/prisma'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { S3Service } from '@/vendors/aws/services/s3.service'
import { parseIsoDateAsUTC } from '@/shared/util/date.util'
import { assertUrlSafeForExternalFetch } from '@/shared/util/ssrf.util'
import {
  USER_AGENDA_MAX_BYTES,
  UserAgendaFinalizeRequest,
  UserAgendaPresignRequest,
} from '../schemas/userAgendaUpload.schema'
import { MeetingBriefingsService } from './meetingBriefings.service'

const PRESIGN_PUT_EXPIRES_IN = 60 * 15 // 15 min — upload itself

// Canonical workspace path the agent reads. The runner pre-fetches each
// authorized input file under /workspace/input/<dest>; instruction.md tells
// the agent to read from that path. Hardcoded because meeting_briefing has
// exactly one user-supplied input (the agenda).
const AGENDA_WORKSPACE_DEST = 'agenda.pdf'

const URL_HEAD_TIMEOUT_MS = 5000
const PDF_CONTENT_TYPES = new Set([
  'application/pdf',
  'application/octet-stream', // some CDNs serve PDFs under octet-stream
])

@Injectable()
export class UserAgendaUploadService extends createPrismaBase(
  MODELS.UserAgendaUpload,
) {
  constructor(
    private readonly s3: S3Service,
    private readonly meetings: MeetingBriefingsService,
  ) {
    super()
  }

  private get bucket(): string {
    const bucket = process.env.AGENT_RUN_INPUTS_BUCKET
    if (!bucket) {
      throw new InternalServerErrorException(
        'AGENT_RUN_INPUTS_BUCKET is not configured',
      )
    }
    return bucket
  }

  private buildUploadKey(
    electedOfficeId: string,
    meetingDate: string,
    uploadId: string,
  ): string {
    return `agendas/${electedOfficeId}/${meetingDate}/${uploadId}.pdf`
  }

  /**
   * Returns a presigned PUT URL for the browser to upload directly to S3.
   * The row is created on finalize, not here — an abandoned presign leaves
   * no DB row (only an orphan S3 object, which lifecycle cleans up).
   */
  async createUploadPresign(
    electedOffice: ElectedOffice,
    meetingDate: string,
    input: UserAgendaPresignRequest,
  ): Promise<{
    uploadId: string
    uploadKey: string
    uploadUrl: string
    expiresAt: string
  }> {
    // Defense in depth — Zod already caps byteSize, but keep the runtime
    // assertion in case the schema relaxes.
    if (input.byteSize > USER_AGENDA_MAX_BYTES) {
      throw new BadRequestException('file_too_large')
    }

    const uploadId = randomUUID()
    const uploadKey = this.buildUploadKey(
      electedOffice.id,
      meetingDate,
      uploadId,
    )

    const uploadUrl = await this.s3.getSignedUrlForUpload(
      this.bucket,
      uploadKey,
      {
        expiresIn: PRESIGN_PUT_EXPIRES_IN,
        contentType: input.contentType,
      },
    )

    return {
      uploadId,
      uploadKey,
      uploadUrl,
      expiresAt: new Date(
        Date.now() + PRESIGN_PUT_EXPIRES_IN * 1000,
      ).toISOString(),
    }
  }

  /**
   * Persists the upload metadata (URL paste or completed S3 upload) and
   * dispatches a fresh briefing run. The dispatch carries either
   * `agendaPacketUrl` (URL paste; agent fetches the user's own URL via the
   * broker proxy) or `_input_files` envelope refs (UPLOAD; the runner
   * pre-fetches via broker /inputs/read and writes to /workspace/input/
   * before the agent boots). The previous run's MeetingBriefing row (if any)
   * is left in place and gets overwritten by the existing upsert path when
   * the new run completes.
   *
   * Idempotent on (electedOfficeId, meetingDate) — re-finalizing replaces
   * the prior upload row and dispatches a new run.
   */
  async finalizeAndDispatch(
    electedOffice: ElectedOffice,
    userId: number,
    meetingDate: string,
    input: UserAgendaFinalizeRequest,
  ): Promise<{ experimentRunId: string }> {
    const meetingDateUtc = parseIsoDateAsUTC(meetingDate)

    let source: UserAgendaSource
    let sourceUrl: string | null = null
    let uploadBucket: string | null = null
    let uploadKey: string | null = null
    let contentType: string | null = null
    let byteSize: number | null = null

    if (input.source === 'URL') {
      const headResult = await this.headCheckUrl(input.sourceUrl)
      source = UserAgendaSource.URL
      sourceUrl = input.sourceUrl
      contentType = headResult.contentType
      byteSize = headResult.byteSize
    } else {
      // UPLOAD — reconstruct the key server-side from trusted parts. Never
      // accept a client-supplied key: doing so would let one office claim
      // another office's S3 object (IDOR). The uploadId is the only piece
      // the client controls, and it's a UUID the server minted at presign.
      const reconstructedKey = this.buildUploadKey(
        electedOffice.id,
        meetingDate,
        input.uploadId,
      )
      const exists = await this.s3.objectExists(this.bucket, reconstructedKey)
      if (!exists) {
        throw new BadRequestException('upload_not_received')
      }
      source = UserAgendaSource.UPLOAD
      uploadBucket = this.bucket
      uploadKey = reconstructedKey
      contentType = 'application/pdf'
    }

    // Persist the upload row BEFORE dispatching the run. If we dispatched
    // first and then the upsert threw, the run would be live with no
    // tracking row — invisible to GET /meetings and impossible to clean up
    // on re-finalize. Upsert with a null run-id, dispatch, then patch the
    // run-id back in.
    const upload = await this.client.userAgendaUpload.upsert({
      where: {
        electedOfficeId_meetingDate: {
          electedOfficeId: electedOffice.id,
          meetingDate: meetingDateUtc,
        },
      },
      create: {
        electedOfficeId: electedOffice.id,
        meetingDate: meetingDateUtc,
        source,
        sourceUrl,
        uploadBucket,
        uploadKey,
        contentType,
        byteSize,
        uploadedByUserId: userId,
        experimentRunId: null,
      },
      update: {
        source,
        sourceUrl,
        uploadBucket,
        uploadKey,
        contentType,
        byteSize,
        uploadedByUserId: userId,
        experimentRunId: null,
      },
      select: { id: true },
    })

    const { runId } = await this.meetings.dispatchBriefingWithUserAgenda({
      electedOfficeId: electedOffice.id,
      meetingDate,
      ...(source === UserAgendaSource.URL && sourceUrl
        ? { agendaPacketUrl: sourceUrl }
        : {}),
      ...(source === UserAgendaSource.UPLOAD && uploadBucket && uploadKey
        ? {
            inputFiles: [
              {
                bucket: uploadBucket,
                key: uploadKey,
                dest: AGENDA_WORKSPACE_DEST,
              },
            ],
          }
        : {}),
    })

    await this.client.userAgendaUpload.update({
      where: { id: upload.id },
      data: { experimentRunId: runId },
    })

    return { experimentRunId: runId }
  }

  /**
   * Surfaces a row-status string for GET /meetings consumers. Returns the
   * map keyed by meeting date (YYYY-MM-DD) for every upload row in the window
   * — including upload rows for meeting dates the caller didn't pre-list
   * (off-list dates the user uploaded an agenda for despite there being no
   * scheduled meeting / briefing row yet).
   */
  async getStatusForMeetings(
    electedOfficeId: string,
    window: { from: Date; to: Date },
  ): Promise<Map<string, 'processing' | 'failed' | 'completed' | 'unknown'>> {
    const rows = await this.client.userAgendaUpload.findMany({
      where: {
        electedOfficeId,
        meetingDate: { gte: window.from, lte: window.to },
      },
      select: {
        meetingDate: true,
        experimentRunId: true,
        experimentRun: { select: { status: true } },
      },
    })
    const out = new Map<
      string,
      'processing' | 'failed' | 'completed' | 'unknown'
    >()
    for (const row of rows) {
      const date = row.meetingDate.toISOString().slice(0, 10)
      const runStatus = row.experimentRun?.status
      if (runStatus === 'RUNNING' || runStatus === 'AWAITING_RESUME') {
        out.set(date, 'processing')
      } else if (runStatus === 'FAILED') {
        out.set(date, 'failed')
      } else if (runStatus === 'COMPLETED') {
        out.set(date, 'completed')
      } else if (row.experimentRunId === null) {
        // Upload row exists with no run linked: dispatch failed (or is racing
        // mid-finalize). From the user's POV the upload didn't kick off a
        // briefing, so surface as `failed` rather than `unknown` — the modal
        // re-opens for a retry. The brief window between row upsert and run
        // linkage during a successful finalize is short; users seeing a
        // momentary `failed` that flips to `processing` on next refresh is
        // acceptable.
        out.set(date, 'failed')
      } else {
        out.set(date, 'unknown')
      }
    }
    return out
  }

  /**
   * HEAD-check a pasted URL. Returns the resolved content-type and size when
   * acceptable; throws otherwise. Avoids dispatching an agent run for
   * obviously-broken URLs (404, redirects to login walls, non-PDF content).
   *
   * SSRF defense: HTTPS-only, and the hostname is resolved + checked against
   * private/loopback/link-local ranges (incl. AWS IMDS) BEFORE every fetch,
   * including each redirect hop. Auto-follow is disabled (`redirect: 'manual'`)
   * so a malicious server can't 3xx us into IMDS or a private host that would
   * pass the initial check but resolve differently after the redirect.
   */
  private async headCheckUrl(
    url: string,
  ): Promise<{ contentType: string; byteSize: number | null }> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), URL_HEAD_TIMEOUT_MS)

    let response: Response
    try {
      response = await this.headFollowingRedirects(url, controller.signal)
    } finally {
      clearTimeout(timer)
    }

    if (!response.ok) {
      throw new BadRequestException({
        error: 'url_unreachable',
        message: `HEAD returned ${response.status}`,
      })
    }

    // Many otherwise-valid PDF hosts return 200 on HEAD without Content-Type
    // (CDNs that only set the header on GET, misconfigured static servers).
    // Fall back to URL-path extension in that case rather than rejecting:
    // we'd rather let a real download attempt 4xx than block the user on a
    // missing header.
    const rawType = (response.headers.get('content-type') ?? '')
      .split(';')[0]
      .trim()
      .toLowerCase()
    let contentType: string
    if (rawType) {
      if (!PDF_CONTENT_TYPES.has(rawType)) {
        throw new BadRequestException({
          error: 'url_not_pdf',
          message: `Content-Type ${rawType} is not a PDF`,
        })
      }
      contentType = rawType
    } else if (new URL(url).pathname.toLowerCase().endsWith('.pdf')) {
      contentType = 'application/pdf'
    } else {
      throw new BadRequestException({
        error: 'url_not_pdf',
        message: 'Content-Type is missing and URL path does not end in .pdf',
      })
    }

    const contentLength = response.headers.get('content-length')
    let byteSize: number | null = null
    if (contentLength) {
      const parsed = Number.parseInt(contentLength, 10)
      if (Number.isFinite(parsed) && parsed > 0) {
        if (parsed > USER_AGENDA_MAX_BYTES) {
          throw new BadRequestException('url_too_large')
        }
        byteSize = parsed
      }
    }

    return { contentType, byteSize }
  }

  /**
   * Issue a HEAD with manual redirect handling. Validates each hop's URL
   * against the SSRF guard so a 3xx pointing at IMDS / a private host / an
   * http:// downgrade is rejected before the next fetch. Caps the chain at
   * 5 hops to bound time and rule out redirect loops.
   */
  private async headFollowingRedirects(
    initialUrl: string,
    signal: AbortSignal,
  ): Promise<Response> {
    const MAX_REDIRECTS = 5
    let currentUrl = initialUrl
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      await assertUrlSafeForExternalFetch(currentUrl)
      let response: Response
      try {
        response = await fetch(currentUrl, {
          method: 'HEAD',
          redirect: 'manual',
          signal,
        })
      } catch (err) {
        throw new BadRequestException({
          error: 'url_unreachable',
          message: err instanceof Error ? err.message : 'fetch_failed',
        })
      }
      if (response.status < 300 || response.status >= 400) {
        return response
      }
      const location = response.headers.get('location')
      if (!location) {
        throw new BadRequestException({
          error: 'url_unreachable',
          message: `HEAD returned ${response.status} without a Location header`,
        })
      }
      // Resolve relative Location against the current URL. The next
      // iteration's assertUrlSafeForExternalFetch will reject if this
      // resolved URL is non-HTTPS, points at a private/loopback host, or
      // fails to resolve.
      currentUrl = new URL(location, currentUrl).toString()
    }
    throw new BadRequestException({
      error: 'url_unreachable',
      message: `URL exceeded the ${MAX_REDIRECTS}-hop redirect cap`,
    })
  }
}
