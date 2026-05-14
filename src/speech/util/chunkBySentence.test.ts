import { describe, expect, it } from 'vitest'
import { chunkBySentence } from './chunkBySentence'

describe('chunkBySentence', () => {
  it('returns an empty array for empty text', () => {
    expect(chunkBySentence('', 100)).toEqual([])
  })

  it('returns the input as a single chunk when shorter than the limit', () => {
    expect(chunkBySentence('Hello world.', 100)).toEqual(['Hello world.'])
  })

  it('splits at sentence boundaries when above the limit', () => {
    const text = 'First sentence. Second sentence. Third sentence.'
    const chunks = chunkBySentence(text, 25)
    expect(chunks).toEqual([
      'First sentence.',
      'Second sentence.',
      'Third sentence.',
    ])
  })

  it('packs multiple sentences into one chunk when they fit', () => {
    const text = 'Short one. Short two. Short three. Short four.'
    const chunks = chunkBySentence(text, 25)
    expect(chunks).toEqual([
      'Short one. Short two.',
      'Short three. Short four.',
    ])
  })

  it('hard-splits a single sentence that exceeds the limit', () => {
    const longSentence = 'a'.repeat(120) + '.'
    const chunks = chunkBySentence(longSentence, 50)
    expect(chunks).toHaveLength(3)
    expect(chunks[0]).toHaveLength(50)
    expect(chunks[1]).toHaveLength(50)
    expect(chunks[2]?.length).toBeLessThanOrEqual(50)
    expect(chunks.join('')).toBe(longSentence)
  })

  it('breaks on newlines too', () => {
    const text = 'Line one\n\nLine two\n\nLine three'
    const chunks = chunkBySentence(text, 12)
    expect(chunks).toEqual(['Line one', 'Line two', 'Line three'])
  })

  it('keeps every chunk under the limit', () => {
    const sentences = Array.from(
      { length: 50 },
      (_, i) => `Sentence number ${i} has some content.`,
    )
    const text = sentences.join(' ')
    const chunks = chunkBySentence(text, 80)
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(80)
    }
  })

  it('does not mutate the input string', () => {
    const text = 'Original sentence one. Original sentence two.'
    chunkBySentence(text, 20)
    expect(text).toBe('Original sentence one. Original sentence two.')
  })

  it('handles question and exclamation boundaries', () => {
    const text = 'Are you there? Yes I am! Good.'
    const chunks = chunkBySentence(text, 16)
    expect(chunks).toEqual(['Are you there?', 'Yes I am! Good.'])
  })

  it('preserves the full text content across chunks', () => {
    const text = 'A first sentence. A second one. And the third one here.'
    const chunks = chunkBySentence(text, 18)
    const recombined = chunks.join(' ').replace(/\s+/g, ' ').trim()
    expect(recombined).toBe(text)
  })
})
