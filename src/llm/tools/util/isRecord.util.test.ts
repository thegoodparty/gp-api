import { describe, expect, it } from 'vitest'
import { isRecord } from './isRecord.util'

describe('isRecord', () => {
  it('returns true for a plain object', () => {
    expect(isRecord({ a: 1 })).toBe(true)
  })

  it('returns true for an empty object', () => {
    expect(isRecord({})).toBe(true)
  })

  it('returns false for an array', () => {
    expect(isRecord([1, 2, 3])).toBe(false)
  })

  it('returns false for null', () => {
    expect(isRecord(null)).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(isRecord(undefined)).toBe(false)
  })

  it('returns false for a string', () => {
    expect(isRecord('hello')).toBe(false)
  })

  it('returns false for a number', () => {
    expect(isRecord(42)).toBe(false)
  })

  it('returns false for a boolean', () => {
    expect(isRecord(true)).toBe(false)
  })

  it('returns false for a function', () => {
    expect(isRecord(() => undefined)).toBe(false)
  })

  it('narrows to Record<string, unknown> when true', () => {
    const v: unknown = { x: 1 }
    if (isRecord(v)) {
      expect(v.x).toBe(1)
    }
  })
})
