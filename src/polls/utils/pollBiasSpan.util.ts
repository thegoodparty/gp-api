import { Logger } from '@nestjs/common'
import { Span, SpanInput } from '../types/pollBias.types'

/**
 * Normalizes whitespace in text by collapsing multiple spaces/tabs/newlines into single spaces.
 */
export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/**
 * Finds the actual index and length in the original text given a normalized index.
 * This handles cases where the LLM returns text with different whitespace.
 * Returns an object with both the start index and the actual length of the match.
 */
export function findActualIndexAndLength(
  originalText: string,
  normalizedSubstring: string,
  normalizedIndex: number,
): { index: number; length: number } | null {
  let normalizedPos = 0
  let actualPos = 0

  while (normalizedPos < normalizedIndex && actualPos < originalText.length) {
    if (/\s/.test(originalText[actualPos])) {
      actualPos++
      while (
        actualPos < originalText.length &&
        /\s/.test(originalText[actualPos])
      ) {
        actualPos++
      }
      normalizedPos++
    } else {
      actualPos++
      normalizedPos++
    }
  }

  if (normalizedPos === normalizedIndex) {
    if (normalizedSubstring.length === 0) {
      return { index: actualPos, length: 0 }
    }

    const firstChar = normalizedSubstring[0]
    if (
      actualPos >= originalText.length ||
      originalText[actualPos].toLowerCase() !== firstChar.toLowerCase()
    ) {
      return null
    }

    const remainingSubstring = normalizedSubstring.substring(1)
    let matchPos = actualPos + 1
    let matchFound = true

    for (let i = 0; i < remainingSubstring.length; i++) {
      const char = remainingSubstring[i]
      if (char === ' ') {
        while (
          matchPos < originalText.length &&
          /\s/.test(originalText[matchPos])
        ) {
          matchPos++
        }
      } else {
        if (
          matchPos >= originalText.length ||
          originalText[matchPos].toLowerCase() !== char.toLowerCase()
        ) {
          matchFound = false
          break
        }
        matchPos++
      }
    }

    if (matchFound) {
      return { index: actualPos, length: matchPos - actualPos }
    }
  }

  return null
}

/**
 * Finds the index of a substring in the original text, handling whitespace variations.
 * Optionally searches from a specific starting position to find subsequent occurrences.
 */
export function findSubstringIndex(
  substring: string,
  originalText: string,
  startFrom: number = 0,
): number {
  const trimmedSubstring = substring.trim()
  let index = originalText.indexOf(trimmedSubstring, startFrom)

  if (index === -1) {
    const normalizedSubstring = normalizeWhitespace(trimmedSubstring)
    const normalizedText = normalizeWhitespace(originalText)
    const normalizedSubstringLower = normalizedSubstring.toLowerCase()
    const normalizedTextLower = normalizedText.toLowerCase()
    let normalizedIndex = normalizedTextLower.indexOf(normalizedSubstringLower)

    if (normalizedIndex !== -1) {
      let result = findActualIndexAndLength(
        originalText,
        normalizedSubstring,
        normalizedIndex,
      )

      while (result !== null && result.index < startFrom) {
        normalizedIndex = normalizedTextLower.indexOf(
          normalizedSubstringLower,
          normalizedIndex + 1,
        )
        if (normalizedIndex === -1) {
          break
        }
        result = findActualIndexAndLength(
          originalText,
          normalizedSubstring,
          normalizedIndex,
        )
      }

      if (result !== null && result.index >= startFrom) {
        index = result.index
      }
    }
  }

  return index
}

/**
 * Validates that a span's indices are within bounds and valid.
 */
export function validateSpanBounds(
  start: number,
  end: number,
  textLength: number,
  substring: string,
  logger: Logger,
): boolean {
  if (start < 0 || end > textLength) {
    logger.warn(
      `Span [${start}, ${end}) is out of bounds for text of length ${textLength}`,
      {
        substring,
        start,
        end,
        textLength,
      },
    )
    return false
  }

  if (start >= end) {
    logger.warn(
      `Invalid span: start (${start}) must be less than end (${end})`,
      {
        substring,
        start,
        end,
      },
    )
    return false
  }

  return true
}

/**
 * Checks if a span overlaps with any existing spans.
 */
export function hasOverlap(
  start: number,
  end: number,
  existingSpans: Span[],
): boolean {
  return existingSpans.some(
    (usedSpan) => start < usedSpan.end && end > usedSpan.start,
  )
}

/**
 * Finds the actual length of a matched substring in the original text.
 * This accounts for whitespace differences between the input substring and the original text.
 */
function findActualMatchLength(
  originalText: string,
  startIndex: number,
  normalizedSubstring: string,
): number {
  const normalizedSubstringNormalized = normalizeWhitespace(normalizedSubstring)

  let actualPos = startIndex
  let matchedLength = 0

  for (let i = 0; i < normalizedSubstringNormalized.length; i++) {
    const char = normalizedSubstringNormalized[i]
    if (char === ' ') {
      while (
        actualPos < originalText.length &&
        /\s/.test(originalText[actualPos])
      ) {
        actualPos++
        matchedLength++
      }
    } else {
      if (
        actualPos < originalText.length &&
        originalText[actualPos].toLowerCase() === char.toLowerCase()
      ) {
        actualPos++
        matchedLength++
      } else {
        break
      }
    }
  }

  return matchedLength > 0 ? matchedLength : normalizedSubstring.length
}

/**
 * Converts a single span input to a Span with indices.
 * Tries multiple occurrences if the first one overlaps with existing spans.
 */
export function convertSpanToIndices(
  spanInput: SpanInput,
  originalText: string,
  existingSpans: Span[],
  logger: Logger,
): Span | null {
  const substring = spanInput.substring.trim()

  if (!substring) {
    logger.warn('Empty span substring provided', {
      reason: spanInput.reason,
    })
    return null
  }

  let searchStart = 0
  let index = findSubstringIndex(substring, originalText, searchStart)

  while (index !== -1) {
    const trimmedSubstring = substring.trim()
    let actualLength = trimmedSubstring.length

    const exactMatch = originalText.substring(
      index,
      index + trimmedSubstring.length,
    )
    if (exactMatch !== trimmedSubstring) {
      const normalizedSubstring = normalizeWhitespace(trimmedSubstring)
      actualLength = findActualMatchLength(
        originalText,
        index,
        normalizedSubstring,
      )
    }

    const start = index
    const end = index + actualLength

    if (
      !validateSpanBounds(start, end, originalText.length, substring, logger)
    ) {
      searchStart = index + 1
      index = findSubstringIndex(substring, originalText, searchStart)
      continue
    }

    if (hasOverlap(start, end, existingSpans)) {
      searchStart = index + 1
      index = findSubstringIndex(substring, originalText, searchStart)
      continue
    }

    return {
      start,
      end,
      reason: spanInput.reason,
      suggestion: spanInput.suggestion,
    }
  }

  logger.warn(
    `Could not find span substring "${substring}" in original text (or all occurrences overlapped)`,
    {
      substring,
      substringLength: substring.length,
      originalTextLength: originalText.length,
      originalTextPreview: originalText.substring(0, 200),
    },
  )
  return null
}

/**
 * Converts substring-based spans to start/end indices.
 * Finds occurrences of each substring in the original text, handling whitespace variations.
 * Checks for overlaps against previously processed spans (from other types).
 */
export function convertSubstringsToIndices(
  spans: SpanInput[],
  originalText: string,
  existingSpans: Span[] = [],
  logger: Logger,
): Span[] {
  const result: Span[] = []
  const allUsedSpans: Span[] = [...existingSpans]

  for (const spanInput of spans) {
    const span = convertSpanToIndices(
      spanInput,
      originalText,
      allUsedSpans,
      logger,
    )

    if (span) {
      result.push(span)
      allUsedSpans.push(span)
    }
  }

  return result.sort((a, b) => a.start - b.start)
}
