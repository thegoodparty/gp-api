import { mapToObject } from './maps.util'

describe('maps.util', () => {
  it('mapToObject converts Map to plain object', () => {
    const m = new Map<string, string>([
      ['a', '1'],
      ['b', '2'],
    ])
    expect(mapToObject(m)).toEqual({ a: '1', b: '2' })
  })
})
