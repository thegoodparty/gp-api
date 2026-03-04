import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Organization } from '@prisma/client'
import { PinoLogger } from 'nestjs-pino'
import { CampaignsService } from 'src/campaigns/services/campaigns.service'
import { ElectedOfficeService } from 'src/electedOffice/services/electedOffice.service'
import {
  REQUIRE_ORGANIZATION_META_KEY,
  RequireOrganizationMetadata,
} from '../decorators/UseOrganization.decorator'
import { OrganizationsService } from '../services/organizations.service'

/**
 * Guard that resolves an Organization and attaches it to the request.
 *
 * Resolution order:
 * 1. `X-Organization-Slug` header — used directly as the org slug.
 * 2. Fallback (only when header is absent):
 *    - `'campaign'`        — derives slug from the user's campaign id.
 *    - `'elected-office'`  — derives slug from the user's active elected office id.
 * 3. The resolved slug is looked up with an ownership check (`ownerId = userId`).
 *
 * Metadata options (set via `@UseOrganization()`):
 * - `fallback`           — which fallback strategy to use when the header is missing.
 * - `include`            — Prisma include passed to `findFirst` (e.g. `{ electedOffice: true }`).
 * - `continueIfNotFound` — if true, allows the request to proceed without an organization.
 *
 * The resolved organization is accessible via `@ReqOrganization()`.
 */
@Injectable()
export class UseOrganizationGuard implements CanActivate {
  constructor(
    private readonly organizationsService: OrganizationsService,
    private readonly campaignsService: CampaignsService,
    private readonly electedOfficeService: ElectedOfficeService,
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

    // Read decorator metadata — method-level overrides class-level.
    const { continueIfNotFound, include, fallback } =
      this.reflector.getAllAndOverride<RequireOrganizationMetadata>(
        REQUIRE_ORGANIZATION_META_KEY,
        [context.getHandler(), context.getClass()],
      ) ?? {}

    const userId = request.user.id

    // Step 1: Try the explicit header first.
    // Fastify lowercases all header names, so we read the lowercase version.
    let slug = request.headers['x-organization-slug']

    // Step 2: If no header was provided, attempt the configured fallback.
    // The header always wins — fallback is only used when the header is absent.
    if (!slug && fallback === 'campaign') {
      // Derive slug from the user's campaign (e.g. "campaign-100").
      const campaign = await this.campaignsService.findByUserId(userId)
      if (campaign) {
        slug = OrganizationsService.campaignOrgSlug(campaign.id)
      }
    } else if (!slug && fallback === 'elected-office') {
      // Derive slug from the user's active elected office (e.g. "eo-abc-123").
      const electedOffice = await this.electedOfficeService.findFirst({
        where: { userId, isActive: true },
      })
      if (electedOffice) {
        slug = OrganizationsService.electedOfficeOrgSlug(electedOffice.id)
      }
    }

    // Step 3: If we still don't have a slug (no header + no fallback match),
    // either allow the request through or reject it.
    if (!slug) {
      if (continueIfNotFound) return true
      this.logger.info('No organization slug provided and no fallback resolved')
      throw new NotFoundException('Organization not found')
    }

    // Step 4: Look up the organization by slug + ownership.
    // The ownerId condition ensures the authenticated user actually owns
    // this organization (no separate authorization check is needed).
    const organization = await this.organizationsService.findFirst({
      where: { slug, ownerId: userId },
      include,
    })

    if (organization) {
      // Step 5a: Verify that all included relations are present.
      // If the decorator requested include: { electedOffice: true } but
      // the resolved org has no linked elected office (e.g. the header
      // pointed to a campaign-type org), treat it as not found rather
      // than letting the handler dereference null.
      if (include && this.hasMissingIncludes(organization, include)) {
        if (continueIfNotFound) return true
        this.logger.info(
          { slug, userId },
          'Organization found but missing required included relation',
        )
        throw new NotFoundException('Organization not found')
      }

      // Step 5b: Attach the organization to the request so it can be
      // extracted by @ReqOrganization() in the handler.
      request.organization = organization
      return true
    } else if (continueIfNotFound) {
      // Step 5c: Org not found but the decorator allows proceeding without one.
      return true
    }

    // Step 5d: Org not found and not optional (reject the request).
    this.logger.info(
      { slug, userId },
      'Organization not found or not owned by user',
    )
    throw new NotFoundException('Organization not found')
  }

  /**
   * Returns true if any top-level key requested in `include` came back
   * as null on the resolved organization. For example, if the decorator
   * specified `include: { electedOffice: true }` but the org has no
   * linked elected office, this returns true.
   */
  private hasMissingIncludes(
    organization: Record<string, unknown>,
    include: Record<string, unknown>,
  ): boolean {
    return Object.entries(include).some(
      ([key, requested]) => requested && organization[key] == null,
    )
  }
}
