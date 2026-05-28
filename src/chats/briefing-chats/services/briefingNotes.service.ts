import { Injectable } from '@nestjs/common'
import {
  AnnotationKind,
  AnnotationResourceType,
  OcrStatus,
} from '@prisma/client'
import { createPrismaBase, MODELS } from '@/prisma/util/prisma.util'
import type { Note } from '@/llm/tools/getMyNotes.tool'
import { extractHighlight } from './extractHighlight'

export interface LoadNotesArgs {
  userId: number
  briefingId: string
  artifactContent: string
}

export interface CountNotesArgs {
  userId: number
  briefingId: string
}

interface AttachmentRow {
  fileName: string
  ocrStatus: OcrStatus
  ocrText: string | null
}

const buildBodyFromAttachments = (
  attachments: AttachmentRow[],
): string | null => {
  const readable = attachments.filter(
    (a) => a.ocrStatus === OcrStatus.completed && a.ocrText,
  )
  if (readable.length === 0) return null
  return readable.map((a) => `[${a.fileName}]\n${a.ocrText}`).join('\n\n')
}

@Injectable()
export class BriefingNotesService extends createPrismaBase(MODELS.Annotation) {
  async loadNotesForChat(args: LoadNotesArgs): Promise<Note[]> {
    const rows = await this.findMany({
      where: {
        authorUserId: args.userId,
        resourceId: args.briefingId,
        resourceType: AnnotationResourceType.briefing,
        kind: AnnotationKind.note,
      },
      include: { note: { include: { attachments: true } } },
      orderBy: { createdAt: 'asc' },
    })

    const notes: Note[] = []
    for (const row of rows) {
      if (row.note == null) continue
      const typed =
        row.note.body && row.note.body.length > 0 ? row.note.body : null
      const fromAttachments = typed
        ? null
        : buildBodyFromAttachments(row.note.attachments)
      const body = typed ?? fromAttachments
      if (body == null) continue
      const highlight = extractHighlight(args.artifactContent, row)
      notes.push({
        id: row.id,
        body,
        jsonPath: row.jsonPath,
        highlightedText: highlight?.text ?? null,
        createdAt: row.createdAt.toISOString(),
      })
    }
    return notes
  }

  async countNotesForUser(args: CountNotesArgs): Promise<number> {
    const notes = await this.loadNotesForChat({
      ...args,
      artifactContent: '',
    })
    return notes.length
  }
}
