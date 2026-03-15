import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { Observable, Subject, filter } from 'rxjs'
import {
  AUTH_USER_UPDATED_EVENT,
  AuthUserEventData,
} from '@/authentication/interfaces/auth-provider.interface'

export interface UserUpdatedEvent {
  clerkId: string
}

@Injectable()
export class UserEventsStreamService {
  private readonly stream = new Subject<UserUpdatedEvent>()

  @OnEvent(AUTH_USER_UPDATED_EVENT)
  handleUserUpdated(data: AuthUserEventData): void {
    this.stream.next({ clerkId: data.externalUserId })
  }

  streamByClerkId(clerkId: string): Observable<UserUpdatedEvent> {
    return this.stream.pipe(filter((event) => event.clerkId === clerkId))
  }
}
