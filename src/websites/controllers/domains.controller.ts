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
  async searchDomains(
    @ReqCampaign() campaign: Campaign & { user: User },
    @Body() { patterns, maxPrice }: SearchDomainsBodySchema,
  ): Promise<PatternedDomainSearchResult> {
    return this.domains.searchDomainsForCampaign(campaign, patterns, maxPrice)
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
