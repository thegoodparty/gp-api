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
      electedOffice?: unknown
    }>()

    const { continueIfNotFound, include, param } =
      this.reflector.getAllAndOverride<RequireElectedOfficeMetadata>(
        REQUIRE_ELECTED_OFFICE_META_KEY,
        [context.getHandler(), context.getClass()],
      ) ?? {}

    const idParam = param ?? 'id'
    const idRaw = request.params?.[idParam]
    const id = idRaw ? Number(idRaw) : undefined

    if (!id || Number.isNaN(id)) {
      this.logger.log('No elected office id provided on request params')
      if (continueIfNotFound) return true
      throw new NotFoundException()
    }

    const electedOffice = await this.electedOfficeService.findUnique({
      where: { id },
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
