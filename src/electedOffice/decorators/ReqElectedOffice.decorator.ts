import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import { ElectedOffice } from '../../generated/prisma'

export const ReqElectedOffice = createParamDecorator(
  (_: undefined, ctx: ExecutionContext): ElectedOffice | undefined => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ electedOffice?: ElectedOffice }>()
    return request.electedOffice
  },
)
