import { createMockLogger } from 'src/shared/test-utils/mockLogger.util'
import { beforeEach, describe, expect, it } from 'vitest'
import { Span, SpanInput } from '../types/pollBias.types'
import {
  convertSpanToIndices,
  convertSubstringsToIndices,
  findActualIndexAndLength,
  findSubstringIndex,
  hasOverlap,
  normalizeWhitespace,
  validateSpanBounds,
} from './pollBiasSpan.util'

describe('pollBiasSpan.util', () => {
  describe('normalizeWhitespace', () => {
    it('collapses multiple spaces into single space', () => {
      expect(normalizeWhitespace('hello    world')).toBe('hello world')
    })

    it('collapses tabs and newlines into single space', () => {
      expect(normalizeWhitespace('hello\t\t\n\nworld')).toBe('hello world')
    })

    it('trims leading and trailing whitespace', () => {
      expect(normalizeWhitespace('  hello world  ')).toBe('hello world')
    })

    it('handles mixed whitespace', () => {
      expect(normalizeWhitespace('hello   \t\n  world')).toBe('hello world')
    })

    it('handles empty string', () => {
      expect(normalizeWhitespace('')).toBe('')
    })

    it('handles string with only whitespace', () => {
      expect(normalizeWhitespace('   \t\n  ')).toBe('')
    })
  })

  describe('findActualIndexAndLength', () => {
    it('finds exact match in text', () => {
      const originalText = 'hello world'
      const normalizedSubstring = 'hello'
      const normalizedIndex = 0

      const result = findActualIndexAndLength(
        originalText,
        normalizedSubstring,
        normalizedIndex,
      )

      expect(result).toEqual({ index: 0, length: 5 })
    })

    it('handles whitespace variations', () => {
      const originalText = 'hello    world'
      const normalizedSubstring = 'hello world'
      const normalizedIndex = 0

      const result = findActualIndexAndLength(
        originalText,
        normalizedSubstring,
        normalizedIndex,
      )

      expect(result).toEqual({ index: 0, length: 14 })
    })

    it('returns null when substring not found at index', () => {
      const originalText = 'hello world'
      const normalizedSubstring = 'xyz'
      const normalizedIndex = 0

      const result = findActualIndexAndLength(
        originalText,
        normalizedSubstring,
        normalizedIndex,
      )

      expect(result).toBeNull()
    })

    it('handles empty substring', () => {
      const originalText = 'hello world'
      const normalizedSubstring = ''
      const normalizedIndex = 5

      const result = findActualIndexAndLength(
        originalText,
        normalizedSubstring,
        normalizedIndex,
      )

      expect(result).toEqual({ index: 5, length: 0 })
    })

    it('handles case-insensitive matching', () => {
      const originalText = 'Hello World'
      const normalizedSubstring = 'hello'
      const normalizedIndex = 0

      const result = findActualIndexAndLength(
        originalText,
        normalizedSubstring,
        normalizedIndex,
      )

      expect(result).toEqual({ index: 0, length: 5 })
    })
  })

  describe('findSubstringIndex', () => {
    it('finds exact substring match', () => {
      const text = 'hello world'
      const substring = 'world'

      const result = findSubstringIndex(substring, text)

      expect(result).toBe(6)
    })

    it('finds substring with whitespace variations', () => {
      const text = 'hello    world'
      const substring = 'hello world'

      const result = findSubstringIndex(substring, text)

      expect(result).toBe(0)
    })

    it('returns -1 when substring not found', () => {
      const text = 'hello world'
      const substring = 'xyz'

      const result = findSubstringIndex(substring, text)

      expect(result).toBe(-1)
    })

    it('searches from startFrom position', () => {
      const text = 'hello world hello'
      const substring = 'hello'
      const startFrom = 6

      const result = findSubstringIndex(substring, text, startFrom)

      expect(result).toBe(12)
    })

    it('handles trimmed substring', () => {
      const text = 'hello world'
      const substring = '  world  '

      const result = findSubstringIndex(substring, text)

      expect(result).toBe(6)
    })
  })

  describe('validateSpanBounds', () => {
    let logger: ReturnType<typeof createMockLogger>

    beforeEach(() => {
      logger = createMockLogger()
    })

    it('returns true for valid span', () => {
      const result = validateSpanBounds(5, 10, 20, 'test', logger)

      expect(result).toBe(true)
      expect(logger.warn).not.toHaveBeenCalled()
    })

    it('returns false when start is negative', () => {
      const result = validateSpanBounds(-1, 10, 20, 'test', logger)

      expect(result).toBe(false)
      expect(logger.warn).toHaveBeenCalled()
    })

    it('returns false when end exceeds text length', () => {
      const result = validateSpanBounds(5, 25, 20, 'test', logger)

      expect(result).toBe(false)
      expect(logger.warn).toHaveBeenCalled()
    })

    it('returns false when start >= end', () => {
      const result = validateSpanBounds(10, 10, 20, 'test', logger)

      expect(result).toBe(false)
      expect(logger.warn).toHaveBeenCalled()
    })

    it('returns false when start > end', () => {
      const result = validateSpanBounds(15, 10, 20, 'test', logger)

      expect(result).toBe(false)
      expect(logger.warn).toHaveBeenCalled()
    })
  })

  describe('hasOverlap', () => {
    it('returns true when spans overlap', () => {
      const existingSpans: Span[] = [
        { start: 5, end: 10, reason: 'test' },
        { start: 15, end: 20, reason: 'test' },
      ]

      const result = hasOverlap(7, 12, existingSpans)

      expect(result).toBe(true)
    })

    it('returns false when spans do not overlap', () => {
      const existingSpans: Span[] = [
        { start: 5, end: 10, reason: 'test' },
        { start: 15, end: 20, reason: 'test' },
      ]

      const result = hasOverlap(11, 14, existingSpans)

      expect(result).toBe(false)
    })

    it('returns true when new span starts before existing ends', () => {
      const existingSpans: Span[] = [{ start: 5, end: 10, reason: 'test' }]

      const result = hasOverlap(8, 15, existingSpans)

      expect(result).toBe(true)
    })

    it('returns true when new span ends after existing starts', () => {
      const existingSpans: Span[] = [{ start: 5, end: 10, reason: 'test' }]

      const result = hasOverlap(0, 7, existingSpans)

      expect(result).toBe(true)
    })

    it('returns false when spans are adjacent', () => {
      const existingSpans: Span[] = [{ start: 5, end: 10, reason: 'test' }]

      const result = hasOverlap(10, 15, existingSpans)

      expect(result).toBe(false)
    })

    it('returns false when existingSpans is empty', () => {
      const result = hasOverlap(5, 10, [])

      expect(result).toBe(false)
    })
  })

  describe('convertSpanToIndices', () => {
    let logger: ReturnType<typeof createMockLogger>

    beforeEach(() => {
      logger = createMockLogger()
    })

    it('converts span input to span with indices', () => {
      const spanInput: SpanInput = {
        substring: 'world',
        reason: 'bias',
        suggestion: 'planet',
      }
      const originalText = 'hello world'
      const existingSpans: Span[] = []

      const result = convertSpanToIndices(
        spanInput,
        originalText,
        existingSpans,
        logger,
      )

      expect(result).toEqual({
        start: 6,
        end: 11,
        reason: 'bias',
        suggestion: 'planet',
      })
    })

    it('handles whitespace variations', () => {
      const spanInput: SpanInput = {
        substring: 'hello world',
        reason: 'bias',
      }
      const originalText = 'hello    world'
      const existingSpans: Span[] = []

      const result = convertSpanToIndices(
        spanInput,
        originalText,
        existingSpans,
        logger,
      )

      expect(result).toEqual({
        start: 0,
        end: 14,
        reason: 'bias',
        suggestion: undefined,
      })
    })

    it('returns null for empty substring', () => {
      const spanInput: SpanInput = {
        substring: '   ',
        reason: 'bias',
      }
      const originalText = 'hello world'
      const existingSpans: Span[] = []

      const result = convertSpanToIndices(
        spanInput,
        originalText,
        existingSpans,
        logger,
      )

      expect(result).toBeNull()
      expect(logger.warn).toHaveBeenCalled()
    })

    it('finds next occurrence when first overlaps', () => {
      const spanInput: SpanInput = {
        substring: 'hello',
        reason: 'bias',
      }
      const originalText = 'hello world hello'
      const existingSpans: Span[] = [{ start: 0, end: 5, reason: 'existing' }]

      const result = convertSpanToIndices(
        spanInput,
        originalText,
        existingSpans,
        logger,
      )

      expect(result).toEqual({
        start: 12,
        end: 17,
        reason: 'bias',
        suggestion: undefined,
      })
    })

    it('returns null when substring not found', () => {
      const spanInput: SpanInput = {
        substring: 'xyz',
        reason: 'bias',
      }
      const originalText = 'hello world'
      const existingSpans: Span[] = []

      const result = convertSpanToIndices(
        spanInput,
        originalText,
        existingSpans,
        logger,
      )

      expect(result).toBeNull()
      expect(logger.warn).toHaveBeenCalled()
    })

    it('returns null when all occurrences overlap', () => {
      const spanInput: SpanInput = {
        substring: 'hello',
        reason: 'bias',
      }
      const originalText = 'hello hello'
      const existingSpans: Span[] = [
        { start: 0, end: 5, reason: 'existing' },
        { start: 6, end: 11, reason: 'existing' },
      ]

      const result = convertSpanToIndices(
        spanInput,
        originalText,
        existingSpans,
        logger,
      )

      expect(result).toBeNull()
      expect(logger.warn).toHaveBeenCalled()
    })

    it('handles trimmed substring', () => {
      const spanInput: SpanInput = {
        substring: '  world  ',
        reason: 'bias',
      }
      const originalText = 'hello world'
      const existingSpans: Span[] = []

      const result = convertSpanToIndices(
        spanInput,
        originalText,
        existingSpans,
        logger,
      )

      expect(result).toEqual({
        start: 6,
        end: 11,
        reason: 'bias',
        suggestion: undefined,
      })
    })
  })

  describe('convertSubstringsToIndices', () => {
    let logger: ReturnType<typeof createMockLogger>

    beforeEach(() => {
      logger = createMockLogger()
    })

    it('converts multiple span inputs to spans with indices', () => {
      const spans: SpanInput[] = [
        { substring: 'world', reason: 'bias' },
        { substring: 'hello', reason: 'grammar' },
      ]
      const originalText = 'hello world'

      const result = convertSubstringsToIndices(spans, originalText, [], logger)

      expect(result).toEqual([
        { start: 0, end: 5, reason: 'grammar', suggestion: undefined },
        { start: 6, end: 11, reason: 'bias', suggestion: undefined },
      ])
    })

    it('sorts results by start index', () => {
      const spans: SpanInput[] = [
        { substring: 'world', reason: 'bias' },
        { substring: 'hello', reason: 'grammar' },
      ]
      const originalText = 'hello world'

      const result = convertSubstringsToIndices(spans, originalText, [], logger)

      expect(result[0].start).toBeLessThan(result[1].start)
    })

    it('respects existing spans to avoid overlaps', () => {
      const spans: SpanInput[] = [{ substring: 'hello', reason: 'bias' }]
      const originalText = 'hello world'
      const existingSpans: Span[] = [{ start: 0, end: 5, reason: 'existing' }]

      const result = convertSubstringsToIndices(
        spans,
        originalText,
        existingSpans,
        logger,
      )

      expect(result).toEqual([])
    })

    it('handles empty spans array', () => {
      const spans: SpanInput[] = []
      const originalText = 'hello world'

      const result = convertSubstringsToIndices(spans, originalText, [], logger)

      expect(result).toEqual([])
    })

    it('filters out spans that cannot be found', () => {
      const spans: SpanInput[] = [
        { substring: 'world', reason: 'bias' },
        { substring: 'xyz', reason: 'grammar' },
      ]
      const originalText = 'hello world'

      const result = convertSubstringsToIndices(spans, originalText, [], logger)

      expect(result).toEqual([
        { start: 6, end: 11, reason: 'bias', suggestion: undefined },
      ])
    })

    it('handles whitespace variations in multiple spans', () => {
      const spans: SpanInput[] = [
        { substring: 'hello    world', reason: 'bias' },
        { substring: 'test', reason: 'grammar' },
      ]
      const originalText = 'hello world test'

      const result = convertSubstringsToIndices(spans, originalText, [], logger)

      expect(result.length).toBeGreaterThan(0)
      expect(result[0].reason).toBe('bias')
    })

    it('usage pattern from pollBiasAnalysis.service - bias spans first', () => {
      const biasSpans: SpanInput[] = [
        { substring: 'world', reason: 'bias', suggestion: 'planet' },
      ]
      const originalText = 'hello world'

      const biasResult = convertSubstringsToIndices(
        biasSpans,
        originalText,
        [],
        logger,
      )

      expect(biasResult).toEqual([
        { start: 6, end: 11, reason: 'bias', suggestion: 'planet' },
      ])
    })

    it('usage pattern from pollBiasAnalysis.service - grammar spans with existing bias spans', () => {
      const grammarSpans: SpanInput[] = [
        { substring: 'hello', reason: 'grammar' },
      ]
      const originalText = 'hello world'
      const existingBiasSpans: Span[] = [
        { start: 6, end: 11, reason: 'bias', suggestion: 'planet' },
      ]

      const grammarResult = convertSubstringsToIndices(
        grammarSpans,
        originalText,
        existingBiasSpans,
        logger,
      )

      expect(grammarResult).toEqual([
        { start: 0, end: 5, reason: 'grammar', suggestion: undefined },
      ])
    })

    it('usage pattern from pollBiasAnalysis.service - grammar spans avoid overlapping bias spans', () => {
      const grammarSpans: SpanInput[] = [
        { substring: 'world', reason: 'grammar' },
      ]
      const originalText = 'hello world'
      const existingBiasSpans: Span[] = [
        { start: 6, end: 11, reason: 'bias', suggestion: 'planet' },
      ]

      const grammarResult = convertSubstringsToIndices(
        grammarSpans,
        originalText,
        existingBiasSpans,
        logger,
      )

      expect(grammarResult).toEqual([])
    })
  })
})
