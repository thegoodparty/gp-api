import { postalAddressToString } from './postalAddresses.util'

describe('postalAddresses.util', () => {
  it('postalAddressToString formats correctly', () => {
    const addr = {
      streetLines: ['123 Main St', 'Apt 4'],
      city: 'Springfield',
      state: 'IL',
      postalCode: '62704',
    }
    expect(postalAddressToString(addr as any)).toBe(
      '123 Main St Apt 4, Springfield, IL 62704',
    )
  })
})


