const SENTENCE_BOUNDARY = /([.!?]+["'\u201d\u2019)\]]*\s+|\n+)/g

export const chunkBySentence = (text: string, maxChars: number): string[] => {
  if (text.length === 0) {
    return []
  }
  if (text.length <= maxChars) {
    return [text]
  }

  const segments: string[] = []
  let lastIndex = 0
  for (const match of text.matchAll(SENTENCE_BOUNDARY)) {
    const end = match.index + match[0].length
    segments.push(text.slice(lastIndex, end))
    lastIndex = end
  }
  if (lastIndex < text.length) {
    segments.push(text.slice(lastIndex))
  }

  const chunks: string[] = []
  let current = ''
  for (const segment of segments) {
    if (segment.length > maxChars) {
      if (current.length > 0) {
        chunks.push(current)
        current = ''
      }
      for (let i = 0; i < segment.length; i += maxChars) {
        chunks.push(segment.slice(i, i + maxChars))
      }
      continue
    }
    if (current.length + segment.length > maxChars) {
      chunks.push(current)
      current = segment
    } else {
      current += segment
    }
  }
  if (current.length > 0) {
    chunks.push(current)
  }

  return chunks.map((chunk) => chunk.trim()).filter((chunk) => chunk.length > 0)
}
