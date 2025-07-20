import { PostalAddress } from '../types/PostalAddress.types'

export const postalAddressToString = (postalAddress: PostalAddress) =>
  `${postalAddress.streetLines.join(' ')}, ${postalAddress.city}, ${postalAddress.state} ${postalAddress.postalCode}`
