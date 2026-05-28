import { describe, expect, it } from 'vitest'
import { RenameAiContentSchema } from './RenameAiContent.schema'

describe('RenameAiContentSchema', () => {
  const schema = RenameAiContentSchema.schema

  it('accepts a valid key and name', () => {
    const result = schema.safeParse({ key: 'intro', name: 'Introduction' })
    expect(result.success).toBe(true)
  })

  it.each(['__proto__', 'constructor', 'prototype'])(
    'rejects forbidden key: %s',
    (key) => {
      const result = schema.safeParse({ key, name: 'anything' })
      expect(result.success).toBe(false)
    },
  )
})
