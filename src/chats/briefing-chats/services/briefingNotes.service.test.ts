import {
  AnnotationKind,
  AnnotationResourceType,
  OcrStatus,
} from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import { PrismaService } from '@/prisma/prisma.service'
import { BriefingNotesService } from './briefingNotes.service'

interface FakeAttachmentRow {
  fileName: string
  ocrStatus: OcrStatus
  ocrText: string | null
}

interface FakeAnnotationRow {
  id: string
  jsonPath: string | null
  start: number | null
  end: number | null
  createdAt: Date
  note: { body: string | null; attachments: FakeAttachmentRow[] } | null
}

const buildService = (deps: {
  findMany?: ReturnType<typeof vi.fn>
  count?: ReturnType<typeof vi.fn>
}): BriefingNotesService => {
  const svc = new BriefingNotesService()
  const fakeAnnotation = {
    findMany: deps.findMany ?? vi.fn(),
    findFirst: vi.fn(),
    findFirstOrThrow: vi.fn(),
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    count: deps.count ?? vi.fn(),
  }
  const fakePrisma = {
    annotation: fakeAnnotation,
  } as unknown as PrismaService
  Object.defineProperty(svc, '_prisma', {
    get: () => fakePrisma,
    configurable: true,
  })
  Object.defineProperty(svc, 'logger', {
    get: () => createMockLogger(),
    configurable: true,
  })
  svc.onModuleInit()
  return svc
}

describe('BriefingNotesService', () => {
  describe('countNotesForUser', () => {
    it('counts only notes that will produce readable content for the LLM', async () => {
      const rows: FakeAnnotationRow[] = [
        {
          id: 'typed',
          jsonPath: null,
          start: null,
          end: null,
          createdAt: new Date('2026-05-10T15:00:00Z'),
          note: { body: 'hello', attachments: [] },
        },
        {
          id: 'attachment-completed',
          jsonPath: null,
          start: null,
          end: null,
          createdAt: new Date('2026-05-10T15:00:00Z'),
          note: {
            body: null,
            attachments: [
              {
                fileName: 'sign.jpg',
                ocrStatus: OcrStatus.completed,
                ocrText: 'VOTE NO',
              },
            ],
          },
        },
        {
          id: 'attachment-pending',
          jsonPath: null,
          start: null,
          end: null,
          createdAt: new Date('2026-05-10T15:00:00Z'),
          note: {
            body: null,
            attachments: [
              {
                fileName: 'flyer.jpg',
                ocrStatus: OcrStatus.pending,
                ocrText: null,
              },
            ],
          },
        },
        {
          id: 'truly-empty',
          jsonPath: null,
          start: null,
          end: null,
          createdAt: new Date('2026-05-10T15:00:00Z'),
          note: { body: '', attachments: [] },
        },
      ]
      const findMany = vi.fn().mockResolvedValue(rows)
      const svc = buildService({ findMany })

      const out = await svc.countNotesForUser({
        userId: 7,
        briefingId: 'brief-1',
      })

      expect(out).toBe(2)
    })

    it('returns 0 when the user has no notes on the briefing', async () => {
      const findMany = vi.fn().mockResolvedValue([])
      const svc = buildService({ findMany })

      const out = await svc.countNotesForUser({
        userId: 7,
        briefingId: 'brief-1',
      })

      expect(out).toBe(0)
    })
  })

  describe('loadNotesForChat', () => {
    let findMany: ReturnType<typeof vi.fn>
    let svc: BriefingNotesService

    beforeEach(() => {
      findMany = vi.fn()
      svc = buildService({ findMany })
    })

    it('returns notes with body, jsonPath, createdAt and null highlight when annotation has no anchor', async () => {
      const rows: FakeAnnotationRow[] = [
        {
          id: 'a-1',
          jsonPath: null,
          start: null,
          end: null,
          createdAt: new Date('2026-05-10T15:00:00Z'),
          note: { body: 'general thought', attachments: [] },
        },
      ]
      findMany.mockResolvedValueOnce(rows)

      const out = await svc.loadNotesForChat({
        userId: 7,
        briefingId: 'b',
        artifactContent: '{}',
      })

      expect(out).toEqual([
        {
          id: 'a-1',
          body: 'general thought',
          jsonPath: null,
          highlightedText: null,
          createdAt: '2026-05-10T15:00:00.000Z',
        },
      ])
    })

    it('skips annotations whose note relation is null', async () => {
      const rows: FakeAnnotationRow[] = [
        {
          id: 'a-1',
          jsonPath: null,
          start: null,
          end: null,
          createdAt: new Date('2026-05-10T15:00:00Z'),
          note: null,
        },
        {
          id: 'a-2',
          jsonPath: null,
          start: null,
          end: null,
          createdAt: new Date('2026-05-11T15:00:00Z'),
          note: { body: 'kept', attachments: [] },
        },
      ]
      findMany.mockResolvedValueOnce(rows)

      const out = await svc.loadNotesForChat({
        userId: 7,
        briefingId: 'b',
        artifactContent: '{}',
      })

      expect(out.map((n) => n.id)).toEqual(['a-2'])
    })

    // Sanity-check: shape mirrors what AnnotationsService.createForBriefing
    // persists for `kind: 'note'` requests (see
    // src/annotations/services/annotations.service.ts). If Stephen's write
    // side and our read side drift, this test fails.
    it('round-trips a note written via the annotations API into a Note', async () => {
      const writtenByAnnotationsApi: FakeAnnotationRow = {
        id: 'cuid-abc',
        jsonPath: '/priorityIssues/0/card/headline',
        start: 0,
        end: 11,
        createdAt: new Date('2026-05-12T10:00:00Z'),
        note: {
          body: 'Worth flagging for the next session.',
          attachments: [],
        },
      }
      findMany.mockResolvedValueOnce([writtenByAnnotationsApi])

      const artifactContent = JSON.stringify({
        priorityIssues: [{ card: { headline: 'Short title text here' } }],
      })

      const out = await svc.loadNotesForChat({
        userId: 7,
        briefingId: 'briefing-cuid',
        artifactContent,
      })

      expect(out).toEqual([
        {
          id: 'cuid-abc',
          body: 'Worth flagging for the next session.',
          jsonPath: '/priorityIssues/0/card/headline',
          highlightedText: 'Short title',
          createdAt: '2026-05-12T10:00:00.000Z',
        },
      ])
      expect(findMany).toHaveBeenCalledWith({
        where: {
          authorUserId: 7,
          resourceId: 'briefing-cuid',
          resourceType: AnnotationResourceType.briefing,
          kind: AnnotationKind.note,
        },
        include: { note: { include: { attachments: true } } },
        orderBy: { createdAt: 'asc' },
      })
    })

    it('returns highlightedText=null when the JSON Pointer fails to resolve', async () => {
      const row: FakeAnnotationRow = {
        id: 'cuid-stale',
        jsonPath: '/missing/path',
        start: 0,
        end: 5,
        createdAt: new Date('2026-05-12T10:00:00Z'),
        note: { body: 'note on now-deleted section', attachments: [] },
      }
      findMany.mockResolvedValueOnce([row])

      const out = await svc.loadNotesForChat({
        userId: 7,
        briefingId: 'b',
        artifactContent: '{"otherField": "x"}',
      })

      expect(out).toEqual([
        {
          id: 'cuid-stale',
          body: 'note on now-deleted section',
          jsonPath: '/missing/path',
          highlightedText: null,
          createdAt: '2026-05-12T10:00:00.000Z',
        },
      ])
    })

    it('uses completed OCR text when the note body is empty', async () => {
      const rows: FakeAnnotationRow[] = [
        {
          id: 'attachment-only',
          jsonPath: null,
          start: null,
          end: null,
          createdAt: new Date('2026-05-13T10:00:00Z'),
          note: {
            body: null,
            attachments: [
              {
                fileName: 'yard-sign.jpg',
                ocrStatus: OcrStatus.completed,
                ocrText: 'RE-ELECT JANE',
              },
            ],
          },
        },
      ]
      findMany.mockResolvedValueOnce(rows)

      const out = await svc.loadNotesForChat({
        userId: 7,
        briefingId: 'b',
        artifactContent: '{}',
      })

      expect(out).toEqual([
        {
          id: 'attachment-only',
          body: '[yard-sign.jpg]\nRE-ELECT JANE',
          jsonPath: null,
          highlightedText: null,
          createdAt: '2026-05-13T10:00:00.000Z',
        },
      ])
    })

    it('concatenates multiple completed attachments with file-name prefixes', async () => {
      const rows: FakeAnnotationRow[] = [
        {
          id: 'multi',
          jsonPath: null,
          start: null,
          end: null,
          createdAt: new Date('2026-05-13T10:00:00Z'),
          note: {
            body: null,
            attachments: [
              {
                fileName: 'a.jpg',
                ocrStatus: OcrStatus.completed,
                ocrText: 'one',
              },
              {
                fileName: 'b.jpg',
                ocrStatus: OcrStatus.completed,
                ocrText: 'two',
              },
            ],
          },
        },
      ]
      findMany.mockResolvedValueOnce(rows)

      const out = await svc.loadNotesForChat({
        userId: 7,
        briefingId: 'b',
        artifactContent: '{}',
      })

      expect(out[0].body).toBe('[a.jpg]\none\n\n[b.jpg]\ntwo')
    })

    it('skips notes whose only attachment has not finished OCR yet', async () => {
      const rows: FakeAnnotationRow[] = [
        {
          id: 'pending',
          jsonPath: null,
          start: null,
          end: null,
          createdAt: new Date('2026-05-13T10:00:00Z'),
          note: {
            body: null,
            attachments: [
              {
                fileName: 'flyer.jpg',
                ocrStatus: OcrStatus.pending,
                ocrText: null,
              },
            ],
          },
        },
        {
          id: 'failed',
          jsonPath: null,
          start: null,
          end: null,
          createdAt: new Date('2026-05-13T10:00:00Z'),
          note: {
            body: null,
            attachments: [
              {
                fileName: 'blurry.jpg',
                ocrStatus: OcrStatus.failed,
                ocrText: null,
              },
            ],
          },
        },
        {
          id: 'kept',
          jsonPath: null,
          start: null,
          end: null,
          createdAt: new Date('2026-05-13T10:00:00Z'),
          note: { body: 'typed', attachments: [] },
        },
      ]
      findMany.mockResolvedValueOnce(rows)

      const out = await svc.loadNotesForChat({
        userId: 7,
        briefingId: 'b',
        artifactContent: '{}',
      })

      expect(out.map((n) => n.id)).toEqual(['kept'])
    })

    it('prefers typed body over OCR text when both exist', async () => {
      const rows: FakeAnnotationRow[] = [
        {
          id: 'mixed',
          jsonPath: null,
          start: null,
          end: null,
          createdAt: new Date('2026-05-13T10:00:00Z'),
          note: {
            body: 'my caption',
            attachments: [
              {
                fileName: 'sign.jpg',
                ocrStatus: OcrStatus.completed,
                ocrText: 'OCR TEXT',
              },
            ],
          },
        },
      ]
      findMany.mockResolvedValueOnce(rows)

      const out = await svc.loadNotesForChat({
        userId: 7,
        briefingId: 'b',
        artifactContent: '{}',
      })

      expect(out[0].body).toBe('my caption')
    })
  })
})
