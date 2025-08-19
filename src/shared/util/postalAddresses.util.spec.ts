import { postalAddressToString } from './postalAddresses.util'
import { PostalAddress } from '../types/PostalAddress.types'

describe('postalAddresses.util', () => {
  it('postalAddressToString formats correctly', () => {
    const addr: PostalAddress = {
      streetLines: ['123 Main St', 'Apt 4'],
      city: 'Springfield',
      state: 'IL',
      postalCode: '62704',
    }
    expect(postalAddressToString(addr)).toBe(
      '123 Main St Apt 4, Springfield, IL 62704',
    )
  })
})
