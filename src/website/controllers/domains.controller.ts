import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UsePipes,
} from '@nestjs/common'
import { DomainsService } from '../services/domains.service'
import { ZodValidationPipe } from 'nestjs-zod'
import { SearchDomainSchema } from '../schemas/SearchDomain.schema'
import { UseCampaign } from 'src/campaigns/decorators/UseCampaign.decorator'
import { ReqCampaign } from 'src/campaigns/decorators/ReqCampaign.decorator'
import { Campaign, UserRole } from '@prisma/client'
import { Roles } from 'src/authentication/decorators/Roles.decorator'

@Controller('domains')
@UsePipes(ZodValidationPipe)
export class DomainsController {
  constructor(private readonly domains: DomainsService) {}

  @Get()
  @Roles(UserRole.admin)
  async domainDetails(@Query() { domain }: SearchDomainSchema) {
    return this.domains.getDomainDetails(domain)
  }

  @Get('search')
  async searchDomain(@Query() { domain }: SearchDomainSchema) {
    return this.domains.searchForDomain(domain)
  }

  @Post()
  @UseCampaign()
  async registerDomain(
    @ReqCampaign() { id: campaignId }: Campaign,
    @Body() { domain }: SearchDomainSchema,
  ) {
    return this.domains.startDomainRegistration(campaignId, domain)
  }

  @Post('complete')
  @UseCampaign()
  @HttpCode(HttpStatus.OK)
  async completeDomainRegistration(
    @ReqCampaign() { id: campaignId }: Campaign,
  ) {
    return this.domains.completeDomainRegistration(campaignId)
  }

  @Get('status')
  @UseCampaign()
  async checkRegistrationStatus(@ReqCampaign() { id: campaignId }: Campaign) {
    return this.domains.checkRegistrationStatus(campaignId)
  }

  // After domain is successfully registered, disable auto renew and configure DNS
  // TODO: should be handled by a queued job instead of a controller
  @Post('configure')
  @UseCampaign()
  @HttpCode(HttpStatus.OK)
  async configureDomain(@ReqCampaign() { id: campaignId }: Campaign) {
    return this.domains.configureDomain(campaignId)
  }
}
