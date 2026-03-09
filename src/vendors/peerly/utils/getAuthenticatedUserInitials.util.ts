import { PeerlyAuthenticatedUser } from '../peerly.types'

export const getAuthenticatedUserInitials = (user: PeerlyAuthenticatedUser) => {
  const firstInitial = user.first_name ? user.first_name.charAt(0) : ''
  const lastInitial = user.last_name ? user.last_name.charAt(0) : ''
  return (firstInitial + lastInitial).toUpperCase()
}
