import {
  BadRequestException,
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
import { Campaign, User, UserRole } from '@prisma/client'
import { Roles } from 'src/authentication/decorators/Roles.decorator'
import { ReqUser } from 'src/authentication/decorators/ReqUser.decorator'
import { WebsitesService } from '../services/websites.service'
import { RegisterDomainSchema } from '../schemas/RegisterDomain.schema'

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

  @Post()
  @UseCampaign()
  async registerDomain(
    @ReqUser() user: User,
    @ReqCampaign() { id: campaignId }: Campaign,
    @Body() { domain }: SearchDomainSchema,
  ) {
    const website = await this.websites.findUnique({
      where: { campaignId },
      select: { id: true },
    })

    if (!website) {
      throw new BadRequestException('No website found for this campaign')
    }

    return this.domains.startDomainRegistration(user, website.id, domain)
  }

  @Post('complete')
  @UseCampaign()
  @HttpCode(HttpStatus.OK)
  async completeDomainRegistration(
    @ReqCampaign() { id: campaignId }: Campaign,
  ) {
    const website = await this.websites.findUnique({
      where: { campaignId },
      select: { id: true },
    })

    if (!website) {
      throw new BadRequestException('No website found for this campaign')
    }

    // TODO: remove and use body https://goodparty.atlassian.net/browse/WEB-4233
    const dummyContact: RegisterDomainSchema = {
      firstName: 'John',
      lastName: 'Doe',
      email: 'test@example.com',
      phoneNumber: '1234567890',
      addressLine1: '123 Main St',
      addressLine2: 'Apt 1',
      city: 'Anytown',
      state: 'CA',
      zipCode: '12345',
    }

    return this.domains.completeDomainRegistration(website.id, dummyContact)
  }

  @Get('status')
  @UseCampaign()
  async checkRegistrationStatus(@ReqCampaign() { id: campaignId }: Campaign) {
    return this.domains.checkRegistrationStatus(campaignId)
  }

  // After domain is successfully registered, disable auto renew and configure DNS
  // TODO: should be handled by a queued job instead of a controller https://goodparty.atlassian.net/browse/WEB-4233
  @Post('configure')
  @UseCampaign()
  @HttpCode(HttpStatus.OK)
  async configureDomain(@ReqCampaign() { id: campaignId }: Campaign) {
    return this.domains.configureDomain(campaignId)
  }
}
