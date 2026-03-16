import { Controller, MessageEvent, Sse } from '@nestjs/common'
import { User } from '@prisma/client'
import { Observable, interval, map, merge } from 'rxjs'
import { ReqUser } from '@/authentication/decorators/ReqUser.decorator'
import { UserEventsStreamService } from './services/user-events-stream.service'

const HEARTBEAT_INTERVAL_MS = 30_000

@Controller('users')
export class UserEventsController {
  constructor(private readonly userEventsStream: UserEventsStreamService) {}

  @Sse('me/events')
  streamUserEvents(@ReqUser() user: User): Observable<MessageEvent> {
    if (!user.clerkId) {
      return new Observable((subscriber) => subscriber.complete())
    }

    const heartbeat = interval(HEARTBEAT_INTERVAL_MS).pipe(
      map(
        (): MessageEvent => ({
          type: 'heartbeat',
          data: {},
        }),
      ),
    )

    const updates = this.userEventsStream.streamByClerkId(user.clerkId).pipe(
      map(
        (): MessageEvent => ({
          type: 'user.updated',
          data: { invalidate: true },
        }),
      ),
    )

    return merge(updates, heartbeat)
  }
}
