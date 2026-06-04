import type { Annotation } from '../../../generated/prisma'
import { isRecord } from '@/llm/tools/util/isRecord.util'

export interface HighlightSnippet {
  text: string
  prefix: string
  suffix: string
}

const SURROUNDING_CHARS = 200

// RFC 6901 JSON Pointer reference token decoding: ~1 -> '/', ~0 -> '~'.
// Order matters: decode ~1 before ~0 to avoid double-decoding a literal '~1'.
const decodeReferenceToken = (token: string): string =>
  token.replace(/~1/g, '/').replace(/~0/g, '~')

const tokenizeJsonPointer = (pointer: string): string[] | null => {
  if (pointer === '') return []
  if (!pointer.startsWith('/')) return null
  return pointer.slice(1).split('/').map(decodeReferenceToken)
}

const stepInto = (cursor: unknown, segment: string): unknown => {
  if (cursor === undefined || cursor === null) return undefined
  if (Array.isArray(cursor)) {
    if (!/^\d+$/.test(segment)) return undefined
    return cursor[Number(segment)]
  }
  if (!isRecord(cursor)) return undefined
  return cursor[segment]
}

const navigateJsonPointer = (root: unknown, pointer: string): unknown => {
  const segments = tokenizeJsonPointer(pointer)
  if (segments === null) return undefined
  let cursor: unknown = root
  for (const seg of segments) {
    cursor = stepInto(cursor, seg)
  }
  return cursor
}

export const extractHighlight = (
  artifactContent: string,
  annotation: Annotation,
): HighlightSnippet | null => {
  if (
    annotation.jsonPath === null ||
    annotation.start === null ||
    annotation.end === null
  ) {
    return null
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(artifactContent)
  } catch {
    return null
  }
  const node = navigateJsonPointer(parsed, annotation.jsonPath)
  if (typeof node !== 'string') return null
  const start = Math.max(0, annotation.start)
  const end = Math.min(node.length, annotation.end)
  if (start >= end) return null
  return {
    text: node.slice(start, end),
    prefix: node.slice(Math.max(0, start - SURROUNDING_CHARS), start),
    suffix: node.slice(end, Math.min(node.length, end + SURROUNDING_CHARS)),
  }
}
