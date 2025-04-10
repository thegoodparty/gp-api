import { Inject, forwardRef, Logger } from '@nestjs/common'
import { User } from '@prisma/client'
import { UsersService } from 'src/users/services/users.service'

const SESSION_TIMEOUT = 1000 * 60 * 30 // 30 minutes (fullstory's inactivity timeout)

export class SessionsService {
  constructor(
    @Inject(forwardRef(() => UsersService))
    private readonly users: UsersService,
    private readonly logger: Logger,
  ) {}

  async trackSession(user: User) {
    // We try catch to prevent crashes since trackSession isn't await'd when called
    try {
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
    } catch (err) {
      if (err instanceof Error) {
        this.logger.warn(
          `Failed to track session for user ${user?.id}: ${err.message}`,
        )
      }
    }
  }
}
