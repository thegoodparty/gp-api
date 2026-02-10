import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { IncomingRequest } from '@/authentication/authentication.types'

@Injectable()
export class M2MOnly implements CanActivate {
  constructor() {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<IncomingRequest>()

    return Boolean(request.m2mToken)
  }
}
