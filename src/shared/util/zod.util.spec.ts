import { z } from 'zod'
import { makeOptional, parseJsonString } from './zod.util'

describe('zod.util', () => {
  it('makeOptional accepts null/undefined/empty and value', () => {
    const schema = makeOptional(z.string())
    expect(schema.safeParse(null).success).toBe(true)
    expect(schema.safeParse(undefined).success).toBe(true)
    expect(schema.safeParse('').success).toBe(true)
    expect(schema.safeParse('x').success).toBe(true)
  })

  it('parseJsonString parses valid JSON and validates', () => {
    const schema = parseJsonString(z.object({ a: z.number() }))
    expect(schema.parse('{"a":1}')).toEqual({ a: 1 })
  })

  it('parseJsonString adds custom error message on invalid JSON', () => {
    const schema = parseJsonString(z.object({ a: z.number() }), 'Bad JSON')
    const res = schema.safeParse('not json')
    expect(res.success).toBe(false)
    if (!res.success) {
      expect(res.error.issues[0].message).toBe('Bad JSON')
    }
  })
})
