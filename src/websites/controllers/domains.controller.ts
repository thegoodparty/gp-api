import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  Query,
  UsePipes,
} from '@nestjs/common'
import { DomainsService } from '../services/domains.service'
import { PaymentStatus } from 'src/payments/payments.types'
import { ZodValidationPipe } from 'nestjs-zod'
import { SearchDomainSchema } from '../schemas/SearchDomain.schema'
import {
  SearchDomainsBodySchema,
  SearchDomainsResponseSchema,
} from '../schemas/SearchDomains.schema'
import {
  PurchaseDomainBodySchema,
  PurchaseDomainResponseSchema,
} from '../schemas/PurchaseDomain.schema'
import { UseCampaign } from 'src/campaigns/decorators/UseCampaign.decorator'
import { ReqCampaign } from 'src/campaigns/decorators/ReqCampaign.decorator'
import { Campaign, DomainStatus, User, UserRole } from '@prisma/client'
import { Roles } from 'src/authentication/decorators/Roles.decorator'
import { WebsitesService } from '../services/websites.service'
import {
  DomainOperationStatus,
  DomainOperationType,
  DomainStatusResponse,
  PatternedDomainSearchResult,
} from '../domains.types'
import { ResponseSchema } from '@/shared/decorators/ResponseSchema.decorator'
import { McpTool } from '@/mcp/decorators/McpTool.decorator'

@Controller('domains')
@UsePipes(ZodValidationPipe)
export class DomainsController {
  constructor(
    private readonly domains: DomainsService,
    private readonly websites: WebsitesService,
  ) {}

  @Get()
  @Roles(UserRole.admin)
  async domainDetails(@Query() { domain }: SearchDomainSchema) {
    return this.domains.getDomainDetails(domain)
  }

  @Get('search')
  async searchDomain(@Query() { domain }: SearchDomainSchema) {
    return this.domains.searchForDomain(domain)
  }

  @Post('search')
  @UseCampaign({ include: { user: true } })
  @HttpCode(HttpStatus.OK)
  @ResponseSchema(SearchDomainsResponseSchema)
  @McpTool({
    description:
      'Find available .com / .org / .vote domains for the calling ' +
      'campaign matching one or more name patterns, under a per-domain ' +
      'price cap. Use during the compliance_setup flow after the ' +
      "candidate's profile is saved, to pick a domain before purchase. " +
      'Patterns are literal candidate domain strings without TLD ' +
      '(e.g. ["janeforsenate", "voteforjane"]); the server checks ' +
      'availability across supported TLDs and returns { candidates: ' +
      '[{ domain, price }] } for ranking. Returns only available ' +
      'domains; an empty candidates list means nothing matched under ' +
      'the cap. Read-only; safe to retry.',
  })
  async searchDomains(
    @ReqCampaign() campaign: Campaign & { user: User },
    @Body() { patterns, maxPrice }: SearchDomainsBodySchema,
  ): Promise<PatternedDomainSearchResult> {
    return this.domains.searchDomainsForCampaign(campaign, patterns, maxPrice)
  }

  @Post('purchase')
  @UseCampaign({ include: { user: true } })
  @HttpCode(HttpStatus.ACCEPTED)
  @ResponseSchema(PurchaseDomainResponseSchema)
  @McpTool({
    description:
      'Purchase a specific available domain for the calling campaign. ' +
      'Call AFTER searchDomains has returned a candidate and the agent ' +
      'has chosen one. Pass the same maxPrice that searchDomains was ' +
      'called with; the server re-checks the live price against this ' +
      'cap and rejects with 409 if Vercel returned a higher price ' +
      'between search and purchase. Idempotent per campaign via a ' +
      'Postgres advisory transaction lock — safe to retry on transient ' +
      'errors; a repeated call for the same domain returns ' +
      'alreadyExisted: true. Conflicts (a different in-progress domain ' +
      'for the campaign, or the domain is no longer available) return ' +
      '4xx. On success the domain reaches DomainStatus.submitted. ' +
      'Poll GET /v1/domains/status to observe progression to ' +
      'registered / active.',
  })
  async purchaseDomain(
    @ReqCampaign() campaign: Campaign & { user: User },
    @Body() { domain, maxPrice }: PurchaseDomainBodySchema,
  ) {
    const result = await this.domains.purchaseDomainForCampaign(
      campaign,
      domain,
      maxPrice,
    )
    return {
      domain: result.domain,
      alreadyExisted: result.alreadyExisted,
      message: result.message,
    }
  }

  @Get('status')
  @UseCampaign()
  async checkRegistrationStatus(
    @ReqCampaign() { id: campaignId }: Campaign,
  ): Promise<DomainStatusResponse> {
    const website = await this.websites.findUnique({
      where: { campaignId },
      select: { id: true },
    })

    if (!website) {
      throw new NotFoundException('No website found for this campaign')
    }

    const domain = await this.domains.getDomainWithPayment(website.id)

    if (!domain) {
      return {
        message: DomainOperationStatus.NO_DOMAIN,
        paymentStatus: null,
      }
    }

    let paymentStatus: PaymentStatus | null = null
    if (domain.paymentId) {
      paymentStatus = await this.domains.getPaymentStatus(domain.paymentId)
    }

    let message: DomainOperationStatus
    switch (domain.status) {
      case DomainStatus.pending:
        message = DomainOperationStatus.IN_PROGRESS
        break
      case DomainStatus.submitted:
        message = DomainOperationStatus.SUBMITTED
        break
      case DomainStatus.registered:
        message = DomainOperationStatus.SUCCESSFUL
        break
      case DomainStatus.active:
        message = DomainOperationStatus.SUCCESSFUL
        break
      case DomainStatus.inactive:
        message = DomainOperationStatus.INACTIVE
        break
      default:
        message = DomainOperationStatus.ERROR
    }

    return {
      message,
      paymentStatus,
      operationDetail: {
        operationId: domain.operationId,
        status: message,
        type: DomainOperationType.REGISTER_DOMAIN,
        submittedDate: new Date(), // Could use domain creation date if needed
      },
    }
  }

  // After domain is successfully registered, disable auto renew and configure DNS
  // TODO: should be handled by a queued job instead of a controller https://goodparty.atlassian.net/browse/WEB-4233
  @Post('configure')
  @UseCampaign()
  @HttpCode(HttpStatus.OK)
  async configureDomain(@ReqCampaign() { id: campaignId }: Campaign) {
    return this.domains.configureDomain(campaignId)
  }

  @Delete()
  @UseCampaign()
  @HttpCode(HttpStatus.OK)
  async deleteDomain(@ReqCampaign() { id: campaignId }: Campaign) {
    const website = await this.websites.findUnique({
      where: { campaignId },
      select: {
        id: true,
        domain: { select: { status: true } },
      },
    })

    if (!website) {
      throw new NotFoundException('No website found for this campaign')
    }

    if (!website.domain) {
      throw new NotFoundException('No domain found for this campaign')
    }

    // Only allow deletion if domain is pending or inactive
    if (
      website.domain.status !== DomainStatus.pending &&
      website.domain.status !== DomainStatus.inactive
    ) {
      throw new BadRequestException(
        `Cannot delete domain with status: ${website.domain.status}. Only pending or inactive domains can be deleted.`,
      )
    }

    return this.domains.deleteDomain(website.id)
  }
}
