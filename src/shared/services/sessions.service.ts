import { User } from '@prisma/client'
import { UsersService } from 'src/users/services/users.service'

const SESSION_TIMEOUT = 1000 * 60 * 60 * 24 // 24 hours

export class SessionsService {
  constructor(private readonly users: UsersService) {}

  async trackSession(user: User) {
    const currentTime = Date.now()

    // Get current metadata
    const currentMetaData = user.metaData || {}
    const lastVisited = currentMetaData.lastVisited || 0
    const sessionCount = currentMetaData.sessionCount || 0

    // Check if this is a new session
    const isNewSession = lastVisited + SESSION_TIMEOUT < currentTime // Time-based check

    if (isNewSession) {
      // Update user metadata with new session info
      await this.users.patchUserMetaData(user.id, {
        lastVisited: currentTime,
        sessionCount: sessionCount + 1,
      })
    } else {
      // Just update last visited time
      await this.users.patchUserMetaData(user.id, {
        lastVisited: currentTime,
      })
    }
  }
}
