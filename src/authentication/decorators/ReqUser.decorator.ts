import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import { User } from '@prisma/client'

export const ReqUser = createParamDecorator(
  (_: undefined, ctx: ExecutionContext): User => {
    const request = ctx.switchToHttp().getRequest<{ user: User }>()
    return request.user
  },
)
