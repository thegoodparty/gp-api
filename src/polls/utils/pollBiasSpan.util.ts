import { Logger } from '@nestjs/common'
import { Span, SpanInput } from '../types/pollBias.types'

/**
 * Normalizes whitespace in text by collapsing multiple spaces/tabs/newlines into single spaces.
 */
export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/**
 * Finds the actual index in the original text given a normalized index.
 * This handles cases where the LLM returns text with different whitespace.
 */
export function findActualIndex(
  originalText: string,
  normalizedSubstring: string,
  normalizedIndex: number,
): number {
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
    const remainingSubstring = normalizedSubstring.substring(1)
    let matchPos = actualPos
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
      return actualPos
    }
  }

  return -1
}

/**
 * Finds the index of a substring in the original text, handling whitespace variations.
 */
export function findSubstringIndex(
  substring: string,
  originalText: string,
): number {
  const trimmedSubstring = substring.trim()
  let index = originalText.indexOf(trimmedSubstring)

  if (index === -1) {
    const normalizedSubstring = normalizeWhitespace(trimmedSubstring)
    const normalizedText = normalizeWhitespace(originalText)
    const normalizedIndex = normalizedText.indexOf(normalizedSubstring)

    if (normalizedIndex !== -1) {
      const actualIndex = findActualIndex(
        originalText,
        normalizedSubstring,
        normalizedIndex,
      )
      if (actualIndex !== -1) {
        index = actualIndex
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
 * Converts a single span input to a Span with indices.
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

  const index = findSubstringIndex(substring, originalText)

  if (index === -1) {
    logger.warn(
      `Could not find span substring "${substring}" in original text`,
      {
        substring,
        substringLength: substring.length,
        originalTextLength: originalText.length,
        originalTextPreview: originalText.substring(0, 200),
      },
    )
    return null
  }

  const start = index
  const end = index + substring.length

  if (!validateSpanBounds(start, end, originalText.length, substring, logger)) {
    return null
  }

  if (hasOverlap(start, end, existingSpans)) {
    logger.warn(`Skipping overlapping span for substring "${substring}"`, {
      substring,
      start,
      end,
    })
    return null
  }

  return {
    start,
    end,
    reason: spanInput.reason,
    suggestion: spanInput.suggestion,
  }
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

