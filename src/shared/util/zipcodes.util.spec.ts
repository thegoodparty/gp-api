import { truncateZip } from './zipcodes.util'

describe('zipcodes.util', () => {
  it('truncateZip trims to 5 when longer', () => {
    expect(truncateZip('123456789')).toBe('12345')
  })

  it('truncateZip leaves <=5 as is', () => {
    expect(truncateZip('12345')).toBe('12345')
    expect(truncateZip('1234')).toBe('1234')
  })
})


