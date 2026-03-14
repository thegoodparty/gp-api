import { Controller, MessageEvent, Sse } from '@nestjs/common'
import { User } from '@prisma/client'
import { Observable, map } from 'rxjs'
import { ReqUser } from '@/authentication/decorators/ReqUser.decorator'
import { UserEventsStreamService } from './services/user-events-stream.service'

@Controller('users')
export class UserEventsController {
  constructor(private readonly userEventsStream: UserEventsStreamService) {}

  @Sse('me/events')
  streamUserEvents(@ReqUser() user: User): Observable<MessageEvent> {
    if (!user.clerkId) {
      return new Observable((subscriber) => subscriber.complete())
    }

    return this.userEventsStream.streamByClerkId(user.clerkId).pipe(
      map(() => ({
        type: 'user.updated',
        data: { invalidate: true },
      })),
    )
  }
}
