import { Injectable } from '@nestjs/common'
import { AnnotationKind, AnnotationResourceType } from '@prisma/client'
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

@Injectable()
export class BriefingNotesService extends createPrismaBase(MODELS.Annotation) {
  countNotesForUser(args: CountNotesArgs): Promise<number> {
    return this.count({
      where: {
        authorUserId: args.userId,
        resourceId: args.briefingId,
        resourceType: AnnotationResourceType.briefing,
        kind: AnnotationKind.note,
        note: { isNot: null },
      },
    })
  }

  async loadNotesForChat(args: LoadNotesArgs): Promise<Note[]> {
    const rows = await this.findMany({
      where: {
        authorUserId: args.userId,
        resourceId: args.briefingId,
        resourceType: AnnotationResourceType.briefing,
        kind: AnnotationKind.note,
      },
      include: { note: true },
      orderBy: { createdAt: 'asc' },
    })

    const notes: Note[] = []
    for (const row of rows) {
      if (!row.note?.body) continue
      const highlight = extractHighlight(args.artifactContent, row)
      notes.push({
        id: row.id,
        body: row.note.body,
        jsonPath: row.jsonPath,
        highlightedText: highlight?.text ?? null,
        createdAt: row.createdAt.toISOString(),
      })
    }
    return notes
  }
}
