import { Injectable } from '@nestjs/common'
import { AsyncLocalStorage } from 'async_hooks'

export interface RequestContext {
  requestId: string
  userId?: string
  method?: string
  url?: string
}

@Injectable()
export class RequestContextService {
  private readonly asyncLocalStorage = new AsyncLocalStorage<RequestContext>()

  run<T>(context: RequestContext, callback: () => T): T {
    return this.asyncLocalStorage.run(context, callback)
  }

  getContext(): RequestContext | undefined {
    return this.asyncLocalStorage.getStore()
  }

  getRequestId(): string | undefined {
    return this.getContext()?.requestId
  }

  getUserId(): string | undefined {
    return this.getContext()?.userId
  }
}
