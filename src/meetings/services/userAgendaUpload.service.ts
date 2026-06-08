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
   *
   * NOTE: the URL-paste path does not HEAD-check the user-supplied URL.
   * SSRF defense lives at the broker — the broker is the actual fetcher
   * at agent-run time and runs in an egress-restricted network. Doing the
   * pre-flight check at gp-api duplicated that defense in a less-secure
   * network position. Bad URLs surface as a FAILED agent run, which
   * `getStatusForMeetings` reports as `status='failed'` so the user can
   * retry by re-uploading.
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
      // No HEAD pre-flight — see method docstring. contentType/byteSize stay
      // null for URL source; we don't know them without fetching, and we
      // intentionally don't fetch.
      source = UserAgendaSource.URL
      sourceUrl = input.sourceUrl
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
      // HEAD the object to verify existence AND validate its actual size
      // against the 75 MB cap. The Zod schema at presign time enforces a
      // byteSize cap on the REQUESTED size, but presigned PUTs don't
      // intrinsically restrict the uploaded body to the requested size — a
      // malformed client could upload a 500 MB file using a presign issued
      // for 1 MB. Re-checking ContentLength here closes that gap before
      // we hand the object off to the agent.
      const head = await this.s3.headObject(this.bucket, reconstructedKey)
      if (!head) {
        throw new BadRequestException('upload_not_received')
      }
      if (
        head.contentLength !== null &&
        head.contentLength > USER_AGENDA_MAX_BYTES
      ) {
        throw new BadRequestException({
          error: 'upload_too_large',
          message:
            `Uploaded file exceeds ${USER_AGENDA_MAX_BYTES}-byte cap ` +
            `(actual size=${head.contentLength})`,
        })
      }
      source = UserAgendaSource.UPLOAD
      uploadBucket = this.bucket
      uploadKey = reconstructedKey
      contentType = 'application/pdf'
      byteSize = head.contentLength
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

    // Conditional update: only set our runId if the row's experimentRunId
    // is still null. A concurrent finalize call (same office + date) would
    // have raced past us — its upsert ran AFTER ours, then it dispatched
    // and patched the row first. In that case our run is orphan-but-bounded:
    // it'll run to completion, FAILED, or AWAITING_RESUME timeout as normal,
    // but won't be tracked by an upload row. We can't kill it from here
    // (the agent's already in flight); log the orphan for observability
    // and return the row's winning runId so the caller polls the right run.
    const claim = await this.client.userAgendaUpload.updateMany({
      where: { id: upload.id, experimentRunId: null },
      data: { experimentRunId: runId },
    })
    if (claim.count === 0) {
      const winner = await this.client.userAgendaUpload.findUnique({
        where: { id: upload.id },
        select: { experimentRunId: true },
      })
      this.logger.warn(
        {
          orphanedRunId: runId,
          winningRunId: winner?.experimentRunId,
          uploadId: upload.id,
          electedOfficeId: electedOffice.id,
          meetingDate,
        },
        'agenda finalize lost concurrency race; orphan run dispatched',
      )
      if (winner?.experimentRunId) {
        return { experimentRunId: winner.experimentRunId }
      }
    }

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
}
