import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import { Campaign } from '../../generated/prisma'

export const ReqCampaign = createParamDecorator(
  (_: undefined, ctx: ExecutionContext): Campaign => {
    const request = ctx.switchToHttp().getRequest<{ campaign: Campaign }>()
    return request.campaign
  },
)
