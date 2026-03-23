import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Organization } from '@prisma/client'
import { PinoLogger } from 'nestjs-pino'
import {
  REQUIRE_ORGANIZATION_META_KEY,
  RequireOrganizationMetadata,
} from '../decorators/UseOrganization.decorator'
import { OrganizationsService } from '../services/organizations.service'

/**
 * Guard that resolves an Organization from the `X-Organization-Slug` header.
 *
 * Used when you need Organization data directly (positionId, overrideDistrictId, etc.).
 * For ElectedOffice or Campaign context, use @UseElectedOffice() or @UseCampaign()
 * instead — those guards also try the organization header before falling back to
 * userId-based lookups.
 *
 * Resolution:
 * 1. Read `X-Organization-Slug` header.
 * 2. Look up the organization by slug + ownership (`ownerId = userId`).
 * 3. Attach to request for `@ReqOrganization()`.
 *
 * Metadata options (set via `@UseOrganization()`):
 * - `continueIfNotFound` — if true, allows the request to proceed without an organization.
 */
@Injectable()
export class UseOrganizationGuard implements CanActivate {
  constructor(
    private readonly organizationsService: OrganizationsService,
    private readonly reflector: Reflector,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(UseOrganizationGuard.name)
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>
      user: { id: number }
      organization?: Organization
    }>()

    const { continueIfNotFound } =
      this.reflector.getAllAndOverride<RequireOrganizationMetadata>(
        REQUIRE_ORGANIZATION_META_KEY,
        [context.getHandler(), context.getClass()],
      ) ?? {}

    const userId = request.user.id
    const slug = request.headers['x-organization-slug']

    if (!slug) {
      if (continueIfNotFound) return true
      this.logger.info('No organization slug header provided')
      throw new NotFoundException('Organization not found')
    }

    const organization = await this.organizationsService.findFirst({
      where: { slug, ownerId: userId },
    })

    if (organization) {
      request.organization = organization
      return true
    } else if (continueIfNotFound) {
      return true
    }

    this.logger.info(
      { slug, userId },
      'Organization not found or not owned by user',
    )
    throw new NotFoundException('Organization not found')
  }
}
