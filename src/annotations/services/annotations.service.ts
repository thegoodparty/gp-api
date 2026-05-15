import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { AnnotationKind, ElectedOffice, Prisma } from '@prisma/client'
import {
  Annotation as AnnotationDTO,
  CreateAnnotationRequest,
} from '@goodparty_org/contracts'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { parseIsoDateAsUTC } from '@/shared/util/date.util'

const MAX_ANNOTATIONS_PER_USER_PER_BRIEFING = 200

const ANNOTATION_INCLUDE = {
  note: true,
  bugReport: true,
  chat: true,
} satisfies Prisma.AnnotationInclude

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
  return base
}

@Injectable()
export class AnnotationsService extends createPrismaBase(MODELS.Annotation) {
  /**
   * Resolve the MeetingBriefing for the active elected office and meeting
   * date. Throws NotFound when no briefing exists at that date for the
   * authorized office; uses the same lookup key as
   * `GET /v1/meetings/:date/briefing`.
   */
  private async resolveBriefingId(
    meetingDate: string,
    electedOffice: ElectedOffice,
  ): Promise<string> {
    const briefing = await this.client.meetingBriefing.findUnique({
      where: {
        electedOfficeId_meetingDate: {
          electedOfficeId: electedOffice.id,
          meetingDate: parseIsoDateAsUTC(meetingDate),
        },
      },
      select: { id: true },
    })
    if (!briefing) throw new NotFoundException('briefing_not_found')
    return briefing.id
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
  ): Promise<AnnotationDTO[]> {
    const briefingId = await this.resolveBriefingId(meetingDate, electedOffice)
    const rows = await this.client.annotation.findMany({
      where: {
        resourceType: 'briefing',
        resourceId: briefingId,
        authorUserId: userId,
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
  ): Promise<AnnotationDTO> {
    const briefingId = await this.resolveBriefingId(meetingDate, electedOffice)

    const existing = await this.client.annotation.count({
      where: {
        resourceType: 'briefing',
        resourceId: briefingId,
        authorUserId: userId,
      },
    })
    if (existing >= MAX_ANNOTATIONS_PER_USER_PER_BRIEFING) {
      throw new ForbiddenException('annotation_limit_reached')
    }

    const anchorFields = {
      jsonPath: input.anchor.json_path,
      start: input.anchor.start,
      end: input.anchor.end,
    }

    if (input.kind === 'note') {
      const row = await this.client.annotation.create({
        data: {
          author: { connect: { id: userId } },
          kind: AnnotationKind.note,
          resourceType: 'briefing',
          resourceId: briefingId,
          ...anchorFields,
          note: { create: { body: input.payload.body } },
        },
        include: ANNOTATION_INCLUDE,
      })
      return toDTO(row)
    }
    // kind === 'bug_report'
    const row = await this.client.annotation.create({
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

  async deleteOne(
    annotationId: string,
    userId: number,
    electedOffice: ElectedOffice,
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
      },
    })
    if (!row) return
    if (row.authorUserId !== userId) {
      throw new ForbiddenException('annotation_not_yours')
    }
    await this.assertAnnotationBriefingAccess(row.resourceId, electedOffice)

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
      // Chat soft-delete is the responsibility of Collin's chat service.
    })
  }
}
