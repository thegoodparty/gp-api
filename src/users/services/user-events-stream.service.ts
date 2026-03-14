import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { Observable, Subject, filter } from 'rxjs'
import { ClerkWebhookEventData } from '@/authentication/webhooks/clerk-webhook.types'

export interface UserUpdatedEvent {
  clerkId: string
}

@Injectable()
export class UserEventsStreamService {
  private readonly stream = new Subject<UserUpdatedEvent>()

  @OnEvent('clerk.user.updated')
  handleUserUpdated(data: ClerkWebhookEventData): void {
    this.stream.next({ clerkId: data.id })
  }

  streamByClerkId(clerkId: string): Observable<UserUpdatedEvent> {
    return this.stream.pipe(filter((event) => event.clerkId === clerkId))
  }
}
