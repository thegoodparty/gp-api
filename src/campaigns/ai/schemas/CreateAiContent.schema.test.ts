import { describe, expect, it } from 'vitest'
import { CreateAiContentSchema } from './CreateAiContent.schema'

describe('CreateAiContentSchema', () => {
  const schema = CreateAiContentSchema.schema

  it('accepts a valid key', () => {
    const result = schema.safeParse({ key: 'bio' })
    expect(result.success).toBe(true)
  })

  it.each(['__proto__', 'constructor', 'prototype'])(
    'rejects forbidden key: %s',
    (key) => {
      const result = schema.safeParse({ key })
      expect(result.success).toBe(false)
    },
  )
})
