import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { ElectedOffice } from '@prisma/client'
import { PinoLogger } from 'nestjs-pino'
import {
  REQUIRE_ELECTED_OFFICE_META_KEY,
  RequireElectedOfficeMetadata,
} from '../decorators/UseElectedOffice.decorator'
import { ElectedOfficeService } from '../services/electedOffice.service'

/**
 * Guard that resolves an ElectedOffice and attaches it to the request.
 *
 * Requires the `X-Organization-Slug` header. Looks up the Organization by slug
 * and owner, then fetches the associated elected office.
 */
@Injectable()
export class UseElectedOfficeGuard implements CanActivate {
  constructor(
    private electedOfficeService: ElectedOfficeService,
    private reflector: Reflector,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(UseElectedOfficeGuard.name)
  }

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>
      user: { id: number }
      electedOffice?: ElectedOffice
    }>()

    const { continueIfNotFound, include } =
      this.reflector.getAllAndOverride<RequireElectedOfficeMetadata>(
        REQUIRE_ELECTED_OFFICE_META_KEY,
        [context.getHandler(), context.getClass()],
      ) ?? {}

    const userId = request.user.id
    let electedOffice: ElectedOffice | null = null

    const slug = request.headers['x-organization-slug']
    if (typeof slug === 'string') {
      const [org, eo] = await Promise.all([
        this.electedOfficeService.client.organization.findFirst({
          where: { slug, ownerId: userId },
        }),
        this.electedOfficeService.findFirst({
          where: { organizationSlug: slug, userId },
          include,
        }),
      ])
      if (org && eo) {
        electedOffice = eo
      }
    }

    if (electedOffice) {
      request.electedOffice = electedOffice
      return true
    } else if (continueIfNotFound === true) {
      return true
    }

    this.logger.info('Elected office not found')
    throw new NotFoundException()
  }
}
