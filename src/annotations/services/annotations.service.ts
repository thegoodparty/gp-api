import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  AnnotationKind,
  ElectedOffice,
  Prisma,
  User,
} from '../../generated/prisma'
import {
  Annotation as AnnotationDTO,
  CreateAnnotationRequest,
} from '@goodparty_org/contracts'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { resolveBriefingId } from '@/meetings/util/resolveBriefingId'
import { S3Service } from '@/vendors/aws/services/s3.service'

const MAX_ANNOTATIONS_PER_USER_PER_BRIEFING = 200

const ANNOTATION_INCLUDE = {
  note: {
    include: {
      attachments: {
        orderBy: { createdAt: 'asc' },
      },
    },
  },
  bugReport: true,
  chat: true,
  annotationReview: true,
} satisfies Prisma.AnnotationInclude

// Everything a normal (non-impersonated) caller may see. `review` is excluded
// by default; it is only returned when a caller explicitly requests it AND
// carries an impersonation actor (server-side default-deny — see listForBriefing).
const NON_REVIEW_KINDS = [
  AnnotationKind.note,
  AnnotationKind.chat,
  AnnotationKind.bug_report,
] as const

type AnnotationWithRelations = Prisma.AnnotationGetPayload<{
  include: typeof ANNOTATION_INCLUDE
}>

function toDTO(row: AnnotationWithRelations): AnnotationDTO {
  const base: AnnotationDTO = {
    id: row.id,
    kind: row.kind,
    resource_type: row.resourceType,
    resource_id: row.resourceId,
    author_user_id: row.authorUserId,
    json_path: row.jsonPath,
    start: row.start,
    end: row.end,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  }
  if (row.note) {
    base.note = {
      id: row.note.id,
      body: row.note.body,
      attachments: row.note.attachments.map((a) => ({
        id: a.id,
        file_name: a.fileName,
        mime_type: a.mimeType,
        size_bytes: a.sizeBytes,
        ocr_status: a.ocrStatus,
        ocr_text: a.ocrText,
        ocr_error: a.ocrError,
        ocr_completed_at: a.ocrCompletedAt
          ? a.ocrCompletedAt.toISOString()
          : null,
        created_at: a.createdAt.toISOString(),
      })),
      created_at: row.note.createdAt.toISOString(),
      updated_at: row.note.updatedAt.toISOString(),
    }
  }
  if (row.bugReport) {
    base.bug_report = {
      id: row.bugReport.id,
      description: row.bugReport.description,
      submitted_at: row.bugReport.submittedAt.toISOString(),
    }
  }
  if (row.chat) {
    base.chat = {
      id: row.chat.id,
      created_at: row.chat.createdAt.toISOString(),
    }
  }
  if (row.annotationReview) {
    base.review = {
      id: row.annotationReview.id,
      body: row.annotationReview.body,
      reviewer_email: row.annotationReview.reviewerEmail,
      created_at: row.annotationReview.createdAt.toISOString(),
      updated_at: row.annotationReview.updatedAt.toISOString(),
    }
  }
  return base
}

@Injectable()
export class AnnotationsService extends createPrismaBase(MODELS.Annotation) {
  constructor(private readonly s3: S3Service) {
    super()
  }

  private get attachmentBucket(): string | null {
    return process.env.ANNOTATION_ATTACHMENTS_BUCKET ?? null
  }
  /**
   * Verify the user is authorized for the annotation's underlying briefing.
   * Used on update/delete by annotation id, where the URL no longer carries
   * the date.
   */
  private async assertAnnotationBriefingAccess(
    briefingResourceId: string,
    electedOffice: ElectedOffice,
  ): Promise<void> {
    const briefing = await this.client.meetingBriefing.findUnique({
      where: { id: briefingResourceId },
      select: { electedOfficeId: true },
    })
    if (!briefing) throw new NotFoundException('briefing_not_found')
    if (briefing.electedOfficeId !== electedOffice.id) {
      throw new ForbiddenException('briefing_not_accessible')
    }
  }

  async listForBriefing(
    meetingDate: string,
    userId: number,
    electedOffice: ElectedOffice,
    actorSub: string | null,
    kinds?: AnnotationKind[],
  ): Promise<AnnotationDTO[]> {
    // Default-deny: omitting `kinds` returns everything except `review`. Asking
    // for `review` requires an impersonation actor — without one we 403 rather
    // than silently returning an empty list, so the boundary is unambiguous.
    const effectiveKinds: AnnotationKind[] = kinds ?? [...NON_REVIEW_KINDS]
    if (effectiveKinds.includes(AnnotationKind.review) && actorSub === null) {
      throw new ForbiddenException('review_requires_impersonation')
    }

    const briefingId = await resolveBriefingId(
      this.client,
      meetingDate,
      electedOffice,
    )
    const rows = await this.client.annotation.findMany({
      where: {
        resourceType: 'briefing',
        resourceId: briefingId,
        authorUserId: userId,
        kind: { in: effectiveKinds },
      },
      orderBy: { createdAt: 'asc' },
      include: ANNOTATION_INCLUDE,
    })
    return rows.map(toDTO)
  }

  async createForBriefing(
    meetingDate: string,
    userId: number,
    electedOffice: ElectedOffice,
    input: CreateAnnotationRequest,
    actorSub: string | null,
    actorUser: User | null,
  ): Promise<AnnotationDTO> {
    // Review annotations can only be authored inside an impersonation session.
    if (input.kind === 'review' && actorSub === null) {
      throw new ForbiddenException('review_requires_impersonation')
    }

    const briefingId = await resolveBriefingId(
      this.client,
      meetingDate,
      electedOffice,
    )

    const anchorFields = {
      jsonPath: input.anchor.json_path,
      start: input.anchor.start,
      end: input.anchor.end,
    }

    // The count check and create must serialize: under concurrent writes,
    // two requests could each observe count=199 and both insert, bypassing
    // the 200-limit. Serializable isolation forces them to retry.
    const row = await this.client.$transaction(
      async (tx) => {
        const existing = await tx.annotation.count({
          where: {
            resourceType: 'briefing',
            resourceId: briefingId,
            authorUserId: userId,
          },
        })
        if (existing >= MAX_ANNOTATIONS_PER_USER_PER_BRIEFING) {
          throw new ForbiddenException('annotation_limit_reached')
        }

        if (input.kind === 'note') {
          return tx.annotation.create({
            data: {
              author: { connect: { id: userId } },
              kind: AnnotationKind.note,
              resourceType: 'briefing',
              resourceId: briefingId,
              ...anchorFields,
              note: { create: { body: input.payload.body ?? null } },
            },
            include: ANNOTATION_INCLUDE,
          })
        }

        if (input.kind === 'review') {
          // Guaranteed non-null by the pre-transaction guard; re-checked here
          // to narrow for the type checker.
          if (actorSub === null) {
            throw new ForbiddenException('review_requires_impersonation')
          }
          // author stays the impersonated (reviewed) user; the admin's
          // identity lives on the AnnotationReview child via reviewerClerkSub.
          return tx.annotation.create({
            data: {
              author: { connect: { id: userId } },
              kind: AnnotationKind.review,
              resourceType: 'briefing',
              resourceId: briefingId,
              ...anchorFields,
              annotationReview: {
                create: {
                  body: input.payload.body,
                  reviewerClerkSub: actorSub,
                  reviewerEmail: actorUser?.email ?? null,
                },
              },
            },
            include: ANNOTATION_INCLUDE,
          })
        }

        return tx.annotation.create({
          data: {
            author: { connect: { id: userId } },
            kind: AnnotationKind.bug_report,
            resourceType: 'briefing',
            resourceId: briefingId,
            ...anchorFields,
            bugReport: { create: { description: input.payload.description } },
          },
          include: ANNOTATION_INCLUDE,
        })
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    )
    return toDTO(row)
  }

  async updateNoteBody(
    annotationId: string,
    userId: number,
    electedOffice: ElectedOffice,
    body: string,
  ): Promise<AnnotationDTO> {
    const row = await this.client.annotation.findUnique({
      where: { id: annotationId },
      include: ANNOTATION_INCLUDE,
    })
    if (!row) throw new NotFoundException('annotation_not_found')
    if (row.authorUserId !== userId) {
      throw new ForbiddenException('annotation_not_yours')
    }
    if (row.kind !== AnnotationKind.note || !row.note) {
      throw new ForbiddenException('not_a_note')
    }
    await this.assertAnnotationBriefingAccess(row.resourceId, electedOffice)

    const updated = await this.client.annotation.update({
      where: { id: annotationId },
      data: {
        note: { update: { body } },
      },
      include: ANNOTATION_INCLUDE,
    })
    return toDTO(updated)
  }

  async updateReviewBody(
    annotationId: string,
    userId: number,
    electedOffice: ElectedOffice,
    actorSub: string | null,
    body: string,
  ): Promise<AnnotationDTO> {
    if (actorSub === null) {
      throw new ForbiddenException('review_requires_impersonation')
    }
    const row = await this.client.annotation.findUnique({
      where: { id: annotationId },
      include: ANNOTATION_INCLUDE,
    })
    if (!row) throw new NotFoundException('annotation_not_found')
    if (row.authorUserId !== userId) {
      throw new ForbiddenException('annotation_not_yours')
    }
    if (row.kind !== AnnotationKind.review || !row.annotationReview) {
      throw new ForbiddenException('not_a_review')
    }
    await this.assertAnnotationBriefingAccess(row.resourceId, electedOffice)

    const updated = await this.client.annotation.update({
      where: { id: annotationId },
      data: {
        annotationReview: { update: { body } },
      },
      include: ANNOTATION_INCLUDE,
    })
    return toDTO(updated)
  }

  async deleteOne(
    annotationId: string,
    userId: number,
    electedOffice: ElectedOffice,
    actorSub: string | null,
  ): Promise<void> {
    const row = await this.client.annotation.findUnique({
      where: { id: annotationId },
      select: {
        id: true,
        authorUserId: true,
        kind: true,
        resourceId: true,
        noteId: true,
        annotationBugReportId: true,
        chatConversationId: true,
        annotationReviewId: true,
        note: {
          select: {
            attachments: { select: { storageKey: true } },
          },
        },
      },
    })
    if (!row) throw new NotFoundException('annotation_not_found')
    if (row.authorUserId !== userId) {
      throw new ForbiddenException('annotation_not_yours')
    }
    // Review rows are authored as the impersonated user, so the author check
    // alone would let that user delete an admin's review. Gate on the actor.
    if (row.kind === AnnotationKind.review && actorSub === null) {
      throw new ForbiddenException('review_requires_impersonation')
    }
    await this.assertAnnotationBriefingAccess(row.resourceId, electedOffice)

    const storageKeys = row.note?.attachments.map((a) => a.storageKey) ?? []

    await this.client.$transaction(async (tx) => {
      await tx.annotation.delete({ where: { id: annotationId } })
      if (row.noteId) {
        await tx.annotationNote.delete({ where: { id: row.noteId } })
      }
      if (row.annotationBugReportId) {
        await tx.annotationBugReport.delete({
          where: { id: row.annotationBugReportId },
        })
      }
      if (row.annotationReviewId) {
        await tx.annotationReview.delete({
          where: { id: row.annotationReviewId },
        })
      }
      // Chat soft-delete is the responsibility of Collin's chat service.
    })

    // Best-effort S3 cleanup for any attachments the deleted note carried.
    // We do this AFTER the transaction commits — better to leak an S3 object
    // than to roll back a successful delete because cleanup failed. The DB
    // cascade has already removed the attachment rows.
    const bucket = this.attachmentBucket
    if (bucket && storageKeys.length > 0) {
      for (const key of storageKeys) {
        try {
          await this.s3.deleteObject(bucket, key)
        } catch (err) {
          this.logger.warn(
            { err, annotationId, key },
            'best-effort S3 delete failed for annotation attachment',
          )
        }
      }
    }
  }
}
