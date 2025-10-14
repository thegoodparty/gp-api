import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { ElectedOfficeService } from '../services/electedOffice.service'
import {
  REQUIRE_ELECTED_OFFICE_META_KEY,
  RequireElectedOfficeMetadata,
} from '../decorators/UseElectedOffice.decorator'
import { ElectedOffice } from '@prisma/client'

@Injectable()
export class UseElectedOfficeGuard implements CanActivate {
  private readonly logger = new Logger(UseElectedOfficeGuard.name)

  constructor(
    private electedOfficeService: ElectedOfficeService,
    private reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{
      params?: Record<string, string>
      user: { id: number }
      electedOffice?: ElectedOffice
    }>()

    const { continueIfNotFound, include, param } =
      this.reflector.getAllAndOverride<RequireElectedOfficeMetadata>(
        REQUIRE_ELECTED_OFFICE_META_KEY,
        [context.getHandler(), context.getClass()],
      ) ?? {}

    const idParam = param ?? 'id'
    const idRaw = request.params?.[idParam]
    const id = idRaw ? Number(idRaw) : undefined

    const electedOffice =
      !id || Number.isNaN(id)
        ? await this.electedOfficeService.findFirst({
            where: { userId: request.user.id, isActive: true },
            include,
          })
        : await this.electedOfficeService.findFirst({
            where: { id, userId: request.user.id },
            include,
          })

    if (electedOffice) {
      request.electedOffice = electedOffice
      return true
    } else if (continueIfNotFound === true) {
      return true
    }

    this.logger.log('Elected office not found')
    throw new NotFoundException()
  }
}
