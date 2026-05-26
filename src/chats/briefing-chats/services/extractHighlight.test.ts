import { describe, expect, it } from 'vitest'
import {
  Annotation,
  AnnotationKind,
  AnnotationResourceType,
} from '@prisma/client'
import { extractHighlight } from './extractHighlight'

const baseAnnotation = (overrides: Partial<Annotation> = {}): Annotation =>
  ({
    id: 'ann-1',
    authorUserId: 1,
    kind: AnnotationKind.chat,
    resourceId: 'briefing-1',
    resourceType: AnnotationResourceType.briefing,
    jsonPath: '/executiveSummary/headline',
    start: 0,
    end: 5,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    noteId: null,
    chatConversationId: null,
    annotationBugReportId: null,
    ...overrides,
  }) as unknown as Annotation

const sampleArtifact = JSON.stringify({
  executiveSummary: {
    headline: 'Hello world from the briefing',
  },
  priorityIssues: [
    {
      number: 1,
      card: {
        headline: 'Short title',
      },
    },
    {
      number: 2,
      card: {
        headline:
          'A much longer second issue title that we will slice in the middle',
      },
    },
  ],
  'weird/key': {
    'has~tilde': 'escaped pointer target',
  },
})

describe('extractHighlight', () => {
  it('returns text/prefix/suffix when jsonPath resolves to a string', () => {
    const annotation = baseAnnotation({
      jsonPath: '/executiveSummary/headline',
      start: 0,
      end: 5,
    })
    const out = extractHighlight(sampleArtifact, annotation)
    expect(out).not.toBeNull()
    expect(out?.text).toBe('Hello')
    expect(out?.prefix).toBe('')
    expect(out?.suffix).toBe(' world from the briefing')
  })

  it('returns null when jsonPath is null', () => {
    const annotation = baseAnnotation({
      jsonPath: null,
      start: null,
      end: null,
    })
    expect(extractHighlight(sampleArtifact, annotation)).toBeNull()
  })

  it('returns null when start is null', () => {
    const annotation = baseAnnotation({ start: null })
    expect(extractHighlight(sampleArtifact, annotation)).toBeNull()
  })

  it('returns null when end is null', () => {
    const annotation = baseAnnotation({ end: null })
    expect(extractHighlight(sampleArtifact, annotation)).toBeNull()
  })

  it('returns null when artifact JSON is invalid', () => {
    const annotation = baseAnnotation()
    expect(extractHighlight('{ not valid json', annotation)).toBeNull()
  })

  it('returns null when jsonPath does not resolve to a string', () => {
    const annotation = baseAnnotation({
      jsonPath: '/priorityIssues',
      start: 0,
      end: 5,
    })
    expect(extractHighlight(sampleArtifact, annotation)).toBeNull()
  })

  it('returns null when jsonPath does not resolve to any node', () => {
    const annotation = baseAnnotation({
      jsonPath: '/doesNotExist/nope',
      start: 0,
      end: 1,
    })
    expect(extractHighlight(sampleArtifact, annotation)).toBeNull()
  })

  it('clamps end to node length when out of bounds', () => {
    const annotation = baseAnnotation({
      jsonPath: '/priorityIssues/0/card/headline',
      start: 0,
      end: 999,
    })
    const out = extractHighlight(sampleArtifact, annotation)
    expect(out).not.toBeNull()
    expect(out?.text).toBe('Short title')
  })

  it('clamps negative start to 0', () => {
    const annotation = baseAnnotation({
      jsonPath: '/executiveSummary/headline',
      start: -10,
      end: 5,
    })
    const out = extractHighlight(sampleArtifact, annotation)
    expect(out).not.toBeNull()
    expect(out?.text).toBe('Hello')
  })

  it('returns null when start equals end (empty selection)', () => {
    const annotation = baseAnnotation({ start: 3, end: 3 })
    expect(extractHighlight(sampleArtifact, annotation)).toBeNull()
  })

  it('returns null when start is greater than end', () => {
    const annotation = baseAnnotation({ start: 10, end: 2 })
    expect(extractHighlight(sampleArtifact, annotation)).toBeNull()
  })

  it('supports array index segments in jsonPath', () => {
    const annotation = baseAnnotation({
      jsonPath: '/priorityIssues/1/card/headline',
      start: 0,
      end: 6,
    })
    const out = extractHighlight(sampleArtifact, annotation)
    expect(out).not.toBeNull()
    expect(out?.text).toBe('A much')
  })

  it('provides up to 200 chars of prefix and suffix around the selection', () => {
    const longString = 'x'.repeat(500) + 'TARGET' + 'y'.repeat(500)
    const artifact = JSON.stringify({ field: longString })
    const annotation = baseAnnotation({
      jsonPath: '/field',
      start: 500,
      end: 506,
    })
    const out = extractHighlight(artifact, annotation)
    expect(out).not.toBeNull()
    expect(out?.text).toBe('TARGET')
    expect(out?.prefix).toHaveLength(200)
    expect(out?.suffix).toHaveLength(200)
    expect(out?.prefix).toBe('x'.repeat(200))
    expect(out?.suffix).toBe('y'.repeat(200))
  })

  it('returns shorter prefix when selection is near the start', () => {
    const annotation = baseAnnotation({
      jsonPath: '/executiveSummary/headline',
      start: 2,
      end: 5,
    })
    const out = extractHighlight(sampleArtifact, annotation)
    expect(out).not.toBeNull()
    expect(out?.text).toBe('llo')
    expect(out?.prefix).toBe('He')
  })

  it('returns null when jsonPath is not a valid JSON Pointer (no leading slash)', () => {
    const annotation = baseAnnotation({
      jsonPath: 'executiveSummary/headline',
      start: 0,
      end: 5,
    })
    expect(extractHighlight(sampleArtifact, annotation)).toBeNull()
  })

  it('returns the whole root string when jsonPath is the empty pointer ""', () => {
    const annotation = baseAnnotation({
      jsonPath: '',
      start: 0,
      end: 5,
    })
    const artifact = JSON.stringify('Hello world')
    const out = extractHighlight(artifact, annotation)
    expect(out).not.toBeNull()
    expect(out?.text).toBe('Hello')
  })

  it('decodes ~1 as / inside a path segment', () => {
    const annotation = baseAnnotation({
      jsonPath: '/weird~1key/has~0tilde',
      start: 0,
      end: 7,
    })
    const out = extractHighlight(sampleArtifact, annotation)
    expect(out).not.toBeNull()
    expect(out?.text).toBe('escaped')
  })
})
