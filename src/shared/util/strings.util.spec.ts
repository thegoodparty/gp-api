import {
  camelToSentence,
  capitalizeFirstLetter,
  generateRandomString,
  toLowerAndTrim,
  trimMany,
} from './strings.util'

describe('strings.util', () => {
  it('trimMany trims values', () => {
    expect(trimMany({ a: ' a ', b: 'b', c: '  c', d: '' })).toEqual({
      a: 'a',
      b: 'b',
      c: 'c',
      d: '',
    })
  })

  it('toLowerAndTrim works', () => {
    expect(toLowerAndTrim(' Foo ')).toBe('foo')
  })

  it('generateRandomString respects min and max', () => {
    const s = generateRandomString(4, 6)
    expect(s.length).toBeGreaterThanOrEqual(4)
    expect(s.length).toBeLessThanOrEqual(6)
  })

  it('camelToSentence converts camelCase', () => {
    expect(camelToSentence('myTestValue')).toBe('My Test Value')
  })

  it('capitalizeFirstLetter handles strings', () => {
    expect(capitalizeFirstLetter('hello')).toBe('Hello')
    expect(capitalizeFirstLetter('h')).toBe('h')
    expect(capitalizeFirstLetter('')).toBe('')
  })
})
