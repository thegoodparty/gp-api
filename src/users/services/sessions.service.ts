import { forwardRef, Inject, Logger } from '@nestjs/common'
import { Interval } from '@nestjs/schedule'
import { User } from '@prisma/client'
import { UsersService } from 'src/users/services/users.service'

const SESSION_TIMEOUT = 1000 * 60 * 30 // 30 minutes (fullstory's inactivity timeout)

const SESSIONS_FLUSH_INTERVAL_MS = Number(
  process.env.SESSIONS_FLUSH_INTERVAL_MS ?? 60_000,
)

export class SessionsService {
  private readonly logger = new Logger(SessionsService.name)
  private readonly pendingLastVisited = new Map<number, number>()
  constructor(
    @Inject(forwardRef(() => UsersService))
    private readonly users: UsersService,
  ) {}

  async trackSession(user: User) {
    // We try catch to prevent crashes since trackSession isn't await'd when called
    try {
      const currentTime = Date.now()

      // Buffer latest lastVisited; flush will handle sessionCount increment
      const prev = this.pendingLastVisited.get(user.id) ?? 0
      if (currentTime > prev) {
        this.pendingLastVisited.set(user.id, currentTime)
      }
    } catch (err) {
      if (err instanceof Error) {
        this.logger.warn(
          `Failed to track session for user ${user?.id}: ${err.message}`,
        )
      }
    }
  }

  @Interval(SESSIONS_FLUSH_INTERVAL_MS)
  async flushBufferedSessions() {
    try {
      if (this.pendingLastVisited.size === 0) return
      const entries = Array.from(this.pendingLastVisited.entries())
      this.pendingLastVisited.clear()
      for (const [userId, pending] of entries) {
        try {
          await this.users.flushLastVisited(userId, pending, SESSION_TIMEOUT)
        } catch (err) {
          if (err instanceof Error) {
            this.logger.warn(
              `Failed to flush lastVisited for user ${userId}: ${err.message}`,
            )
          } else {
            this.logger.warn(
              `Failed to flush lastVisited for user ${userId}: Unknown error`,
            )
          }
        }
      }
    } catch (err) {
      if (err instanceof Error) {
        this.logger.warn(`Failed to flush sessions: ${err.message}`)
      }
    }
  }
}
