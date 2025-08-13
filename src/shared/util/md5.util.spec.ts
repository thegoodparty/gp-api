import { md5 } from './md5.util'

describe('md5.util', () => {
  it('computes md5 hash', () => {
    expect(md5('abc')).toBe('900150983cd24fb0d6963f7d28e17f72')
  })
})


