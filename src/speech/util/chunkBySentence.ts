// Sentence boundary detector. Quantifiers are bounded so the regex cannot
// backtrack polynomially on adversarial input (e.g. a 50,000-char run of
// "!!!"). The bounds are deliberately small but more than enough for real
// prose: at most 4 terminal punctuation chars in a row ("!!!"), at most 4
// closing quote/paren/bracket chars after a sentence ("…")"), at most 4
// inter-sentence whitespace chars, or up to 4 consecutive newlines for
// paragraph breaks. Anything beyond those bounds gets split across two
// matches at the next iteration, which is still correct for chunking.
const SENTENCE_BOUNDARY = /([.!?]{1,4}["'\u201d\u2019)\]]{0,4}\s{1,4}|\n{1,4})/g

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
