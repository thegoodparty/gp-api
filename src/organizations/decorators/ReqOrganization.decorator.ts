import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import { Organization } from '../../generated/prisma'

export const ReqOrganization = createParamDecorator(
  (_: undefined, ctx: ExecutionContext): Organization | undefined => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ organization?: Organization }>()
    return request.organization
  },
)
