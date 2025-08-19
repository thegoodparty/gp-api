import { flip, objectNotEmpty, pick, pickKeys } from './objects.util'

describe('objects.util', () => {
  it('flip swaps keys and values', () => {
    expect(flip({ a: '1', b: '2' })).toEqual({ '1': 'a', '2': 'b' })
  })

  it('objectNotEmpty detects non-empty objects', () => {
    expect(objectNotEmpty({})).toBe(false)
    expect(objectNotEmpty({ a: 1 })).toBe(true)
  })

  it('pick selects subset of keys', () => {
    const src = { a: 1, b: 2 }
    expect(pick(src, ['a'])).toEqual({ a: 1 })
  })

  it('pick throws on invalid args', () => {
    // @ts-expect-error testing runtime error path
    expect(() => pick(null, ['a'])).toThrow('invalid args')
    // @ts-expect-error testing runtime error path
    expect(() => pick({}, null)).toThrow('invalid args')
  })

  it('pickKeys keeps types and filters missing', () => {
    const src = { a: 1, b: 2, c: undefined as number | undefined }
    const result = pickKeys(src, ['a', 'c'] as const)
    expect(result).toEqual({ a: 1 })
  })
})
