import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import { ElectedOffice } from '@prisma/client'

export const ReqElectedOffice = createParamDecorator(
  (_: undefined, ctx: ExecutionContext): ElectedOffice | undefined => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ electedOffice?: ElectedOffice }>()
    return request.electedOffice
  },
)
