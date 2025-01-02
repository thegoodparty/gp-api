import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import { Campaign } from '@prisma/client'

export const ReqCampaign = createParamDecorator(
  (_: undefined, ctx: ExecutionContext): Campaign => {
    const request = ctx.switchToHttp().getRequest()
    return request.campaign
  },
)
