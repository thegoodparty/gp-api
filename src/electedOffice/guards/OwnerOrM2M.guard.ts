import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { M2MToken } from '@clerk/backend'
import { ElectedOfficeService } from '../services/electedOffice.service'

@Injectable()
export class OwnerOrM2MGuard implements CanActivate {
  constructor(private readonly electedOfficeService: ElectedOfficeService) {}

  async canActivate(context: ExecutionContext) {
    const { user, params, m2mToken } = context.switchToHttp().getRequest<{
      user?: { id: number }
      params: { id: string }
      m2mToken?: M2MToken
    }>()

    if (m2mToken) return true
    if (!user) return false

    const record = await this.electedOfficeService.findUnique({
      where: { id: params.id },
      select: { userId: true },
    })

    return record?.userId === user.id
  }
}
