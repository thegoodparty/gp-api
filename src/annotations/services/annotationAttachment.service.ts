import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  AnnotationKind,
  ElectedOffice,
  OcrStatus,
  Prisma,
} from '@prisma/client'
import {
  AttachmentDownloadUrlResponse,
  AttachmentPresignRequest,
  AttachmentPresignResponse,
} from '@goodparty_org/contracts'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { S3Service } from '@/vendors/aws/services/s3.service'
import { OcrService } from '@/ocr/ocr.service'
import { QueueProducerService } from '@/queue/producer/queueProducer.service'
import { MessageGroup, QueueType } from '@/queue/queue.types'

const MAX_ATTACHMENTS_PER_NOTE = 20
const UPLOAD_URL_EXPIRES_IN = 60 * 15 // 15 minutes
const DOWNLOAD_URL_EXPIRES_IN = 60 * 15 // 15 minutes
const OCR_TEXT_MAX_BYTES = 200_000

/**
 * Attachment lifecycle on top-level briefing notes. Each step is gated by
 * the same tenant/author checks the annotation service uses, plus an
 * attachment-specific cap (one per note in Phase 2).
 *
 * Flow:
 *   1. presign — server creates the row in `pending` state, returns S3 PUT URL.
 *   2. client PUTs bytes to S3 directly.
 *   3. complete — server checks S3, enqueues OCR_ATTACHMENT.
 *   4. consumer.runOcr — pulls bytes, runs OcrService, writes result to row.
 *   5. delete — removes row + S3 object.
 */
@Injectable()
export class AnnotationAttachmentService extends createPrismaBase(
  MODELS.AnnotationNoteAttachment,
) {
  constructor(
    private readonly s3: S3Service,
    private readonly ocr: OcrService,
    @Inject(QueueProducerService)
    private readonly queue: QueueProducerService,
  ) {
    super()
  }

  private get bucket(): string {
    const bucket = process.env.ANNOTATION_ATTACHMENTS_BUCKET
    if (!bucket) {
      throw new Error('ANNOTATION_ATTACHMENTS_BUCKET is not configured')
    }
    return bucket
  }

  private buildStorageKey(annotationId: string, attachmentId: string): string {
    return `annotations/${annotationId}/${attachmentId}`
  }

  /**
   * Loads the annotation row + verifies the requesting user is its author
   * and the elected office matches the briefing. Used by every attachment
   * endpoint.
   */
  private async loadOwnedNoteAnnotation(
    annotationId: string,
    userId: number,
    electedOffice: ElectedOffice,
  ): Promise<{ noteId: string }> {
    const annotation = await this.client.annotation.findUnique({
      where: { id: annotationId },
      select: {
        kind: true,
        authorUserId: true,
        resourceId: true,
        noteId: true,
      },
    })
    if (!annotation) throw new NotFoundException('annotation_not_found')
    if (annotation.kind !== AnnotationKind.note || !annotation.noteId) {
      throw new ForbiddenException('not_a_note')
    }
    if (annotation.authorUserId !== userId) {
      throw new ForbiddenException('annotation_not_yours')
    }
    const briefing = await this.client.meetingBriefing.findUnique({
      where: { id: annotation.resourceId },
      select: { electedOfficeId: true },
    })
    if (!briefing) throw new NotFoundException('briefing_not_found')
    if (briefing.electedOfficeId !== electedOffice.id) {
      throw new ForbiddenException('briefing_not_accessible')
    }
    return { noteId: annotation.noteId }
  }

  /**
   * Creates a pending attachment row and returns a presigned S3 PUT URL.
   * Capped at MAX_ATTACHMENTS_PER_NOTE per note; exceeding callers get a
   * 403 (`attachment_limit_reached`).
   */
  async createPresign(
    annotationId: string,
    userId: number,
    electedOffice: ElectedOffice,
    input: AttachmentPresignRequest,
  ): Promise<AttachmentPresignResponse> {
    const { noteId } = await this.loadOwnedNoteAnnotation(
      annotationId,
      userId,
      electedOffice,
    )

    // Count + create + storage-key update must serialize: under concurrent
    // requests, two presigns could both observe count=0 and both insert,
    // bypassing the one-attachment-per-note cap. Same shape as the 200-
    // annotation limit guard in AnnotationsService.
    const created = await this.client.$transaction(
      async (tx) => {
        const existing = await tx.annotationNoteAttachment.count({
          where: { noteId },
        })
        if (existing >= MAX_ATTACHMENTS_PER_NOTE) {
          throw new ForbiddenException('attachment_limit_reached')
        }
        const row = await tx.annotationNoteAttachment.create({
          data: {
            note: { connect: { id: noteId } },
            fileName: input.file_name,
            mimeType: input.mime_type,
            sizeBytes: input.size_bytes,
            storageKey: '', // populated below
            ocrStatus: OcrStatus.pending,
          },
          select: { id: true },
        })
        const storageKey = this.buildStorageKey(annotationId, row.id)
        await tx.annotationNoteAttachment.update({
          where: { id: row.id },
          data: { storageKey },
        })
        return { id: row.id, storageKey }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    )

    const storageKey = created.storageKey

    const uploadUrl = await this.s3.getSignedUrlForUpload(
      this.bucket,
      storageKey,
      { expiresIn: UPLOAD_URL_EXPIRES_IN, contentType: input.mime_type },
    )

    return {
      attachment_id: created.id,
      upload_url: uploadUrl,
      storage_key: storageKey,
    }
  }

  /**
   * Confirms the upload landed in S3 and enqueues the OCR job. We don't
   * validate file contents here — the OCR worker rejects mime/size
   * mismatches when it actually reads the bytes.
   */
  async completeUpload(
    annotationId: string,
    attachmentId: string,
    userId: number,
    electedOffice: ElectedOffice,
  ): Promise<void> {
    const { noteId } = await this.loadOwnedNoteAnnotation(
      annotationId,
      userId,
      electedOffice,
    )
    const attachment = await this.client.annotationNoteAttachment.findUnique({
      where: { id: attachmentId },
      select: { id: true, noteId: true, storageKey: true, ocrStatus: true },
    })
    if (!attachment || attachment.noteId !== noteId) {
      throw new NotFoundException('attachment_not_found')
    }
    if (attachment.ocrStatus !== OcrStatus.pending) {
      throw new BadRequestException('attachment_already_processed')
    }

    // HEAD instead of full GET — we only need to know the object is there,
    // not read its bytes (the OCR worker reads the bytes later via
    // OcrService).
    const exists = await this.s3.objectExists(
      this.bucket,
      attachment.storageKey,
    )
    if (!exists) {
      throw new BadRequestException('upload_not_received')
    }

    await this.queue.sendMessage(
      {
        type: QueueType.OCR_ATTACHMENT,
        data: { attachmentId },
      },
      MessageGroup.default,
      { deduplicationId: `ocr-${attachmentId}` },
    )
  }

  /**
   * Returns a short-lived presigned S3 GET URL for this attachment. The
   * client uses it for `<img src>` thumbnails on image attachments and
   * `window.open` for non-image attachments. Bytes never pass through
   * gp-api — the URL points straight at S3.
   */
  async createDownloadUrl(
    annotationId: string,
    attachmentId: string,
    userId: number,
    electedOffice: ElectedOffice,
  ): Promise<AttachmentDownloadUrlResponse> {
    const { noteId } = await this.loadOwnedNoteAnnotation(
      annotationId,
      userId,
      electedOffice,
    )
    const attachment = await this.client.annotationNoteAttachment.findUnique({
      where: { id: attachmentId },
      select: { id: true, noteId: true, storageKey: true },
    })
    if (!attachment || attachment.noteId !== noteId) {
      throw new NotFoundException('attachment_not_found')
    }

    const downloadUrl = await this.s3.getSignedUrlForViewing(
      this.bucket,
      attachment.storageKey,
      { expiresIn: DOWNLOAD_URL_EXPIRES_IN },
    )
    if (!downloadUrl) {
      throw new NotFoundException('attachment_not_found')
    }

    return {
      download_url: downloadUrl,
      expires_at: new Date(
        Date.now() + DOWNLOAD_URL_EXPIRES_IN * 1000,
      ).toISOString(),
    }
  }

  /**
   * Idempotent delete: removes the row and best-effort removes the S3 object.
   * Cascades to no-op if the row's note is itself deleted via the annotation
   * delete path (DB cascade handles that).
   */
  async deleteAttachment(
    annotationId: string,
    attachmentId: string,
    userId: number,
    electedOffice: ElectedOffice,
  ): Promise<void> {
    const { noteId } = await this.loadOwnedNoteAnnotation(
      annotationId,
      userId,
      electedOffice,
    )
    const attachment = await this.client.annotationNoteAttachment.findUnique({
      where: { id: attachmentId },
      select: { id: true, noteId: true, storageKey: true },
    })
    if (!attachment || attachment.noteId !== noteId) {
      throw new NotFoundException('attachment_not_found')
    }

    await this.client.annotationNoteAttachment.delete({
      where: { id: attachmentId },
    })
    try {
      await this.s3.deleteObject(this.bucket, attachment.storageKey)
    } catch (err) {
      this.logger.warn(
        { err, attachmentId, storageKey: attachment.storageKey },
        'best-effort S3 delete failed for attachment',
      )
    }
  }

  /**
   * Queue-side handler. Called from QueueConsumerService when an
   * OCR_ATTACHMENT message arrives.
   */
  async runOcr(attachmentId: string): Promise<void> {
    const attachment = await this.client.annotationNoteAttachment.findUnique({
      where: { id: attachmentId },
      select: {
        id: true,
        noteId: true,
        storageKey: true,
        mimeType: true,
        fileName: true,
        ocrStatus: true,
      },
    })
    if (!attachment) {
      this.logger.warn(
        { attachmentId },
        'OCR job for missing attachment, dropping',
      )
      return
    }
    if (
      attachment.ocrStatus === OcrStatus.completed ||
      attachment.ocrStatus === OcrStatus.skipped
    ) {
      this.logger.info(
        { attachmentId, ocrStatus: attachment.ocrStatus },
        'OCR already complete for attachment, skipping',
      )
      return
    }

    await this.client.annotationNoteAttachment.update({
      where: { id: attachmentId },
      data: { ocrStatus: OcrStatus.processing },
    })

    try {
      const result = await this.ocr.process({
        bucket: this.bucket,
        key: attachment.storageKey,
        mimeType: attachment.mimeType,
        fileName: attachment.fileName,
      })
      const trimmed = result.text.slice(0, OCR_TEXT_MAX_BYTES)
      await this.client.annotationNoteAttachment.update({
        where: { id: attachmentId },
        data: {
          ocrStatus: result.ocrStatus,
          ocrText: trimmed,
          ocrError: null,
          ocrCompletedAt: new Date(),
        },
      })
      // When the parent note's body is still null (the camera/upload intake
      // path), copy the OCR text into body so downstream readers (recap,
      // list UI, search) can read everything off `body` without knowing
      // about attachment.ocr_text. `updateMany` with body:null in the where
      // clause makes this a no-op if the user typed a body.
      if (trimmed.trim().length > 0) {
        await this.client.annotationNote.updateMany({
          where: { id: attachment.noteId, body: null },
          data: { body: trimmed },
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.logger.error(
        { attachmentId, error: message },
        'OCR run failed for attachment',
      )
      await this.client.annotationNoteAttachment.update({
        where: { id: attachmentId },
        data: {
          ocrStatus: OcrStatus.failed,
          ocrError: message.slice(0, 1000),
          ocrCompletedAt: new Date(),
        },
      })
    }
  }
}

// Re-export Prisma type for tests that want to seed attachments directly.
export type AnnotationAttachmentRow =
  Prisma.AnnotationNoteAttachmentGetPayload<true>
