import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { AwsRoute53Service } from 'src/aws/services/awsRoute53.service'
import { WebsitesService } from './websites.service'
import { WebsiteDomainStatus } from '@prisma/client'
import { OperationStatus } from '@aws-sdk/client-route-53-domains'
import { RRType } from '@aws-sdk/client-route-53'
import { VercelService } from 'src/vercel/services/vercel.service'
import { VERCEL_DNS_IP } from 'src/vercel/vercel.const'
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'

@Injectable()
export class DomainsService {
  private readonly logger = new Logger(DomainsService.name)

  constructor(
    private readonly route53: AwsRoute53Service,
    private readonly websites: WebsitesService,
    private readonly vercel: VercelService,
  ) {}

  async getDomainDetails(domainName: string) {
    return this.route53.getDomainDetails(domainName)
  }

  async searchForDomain(domainName: string) {
    const tld = domainName.split('.').at(-1)

    const [pricesResp, availabilityResp] = await Promise.all([
      this.route53.listPrices(tld),
      this.route53.checkDomainAvailability(domainName),
    ])

    const registrationPrice = pricesResp?.Prices?.[0]?.RegistrationPrice?.Price
    const renewalPrice = pricesResp?.Prices?.[0]?.RenewalPrice?.Price

    return {
      domainName,
      availability: availabilityResp.Availability,
      prices: {
        registration: registrationPrice,
        renewal: renewalPrice,
      },
    }
  }

  // To be called after domain is selected, update website record in DB with desired domain and await payment
  async startDomainRegistration(campaignId: number, domainName: string) {
    // TODO: create stripe invoice or something here
    // OR: if we decide to eat the cost, this can merge with completeDomainRegistration
    try {
      return await this.websites.setDomain(campaignId, domainName)
    } catch (error) {
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new BadRequestException(`Website not created yet`)
      }

      throw error
    }
  }

  // To be called after payment is accepted, send registration request to AWS
  async completeDomainRegistration(campaignId: number) {
    const website = await this.websites.findUniqueOrThrow({
      where: { campaignId },
    })

    if (!website.domain) {
      throw new BadRequestException('Domain not specified')
    }

    const operationId = await this.route53.registerDomain(website.domain)

    await this.websites.update({
      where: { campaignId },
      data: {
        domainOperationId: operationId,
        domainStatus: WebsiteDomainStatus.submitted,
      },
    })

    // TODO: how to handle for polling status on server side?

    return operationId
  }

  async configureDomain(campaignId: number) {
    const website = await this.websites.findUniqueOrThrow({
      where: { campaignId },
    })

    if (!website.domain) {
      throw new BadRequestException('Domain not specified')
    }

    // can only turn off auto renew after registration
    await this.route53.disableAutoRenew(website.domain)

    const route53Response = await this.route53.setDnsRecords(
      website.domain,
      RRType.A,
      VERCEL_DNS_IP, // point to Vercel's Anycast IP
    )
    this.logger.debug('Updated domain DNS record', route53Response.ChangeInfo)

    const vercelResponse = await this.vercel.addDomainToProject(website.domain)
    this.logger.debug('Added domain to Vercel project', vercelResponse)

    if (!vercelResponse.verified) {
      this.logger.warn(
        `Domain ${website.domain} added to Vercel but requires verification`,
        vercelResponse.verification,
      )
    }

    return vercelResponse
  }

  async checkRegistrationStatus(campaignId: number) {
    const website = await this.websites.findUniqueOrThrow({
      where: { campaignId },
    })

    const operationId = website.domainOperationId

    if (!operationId) {
      throw new BadRequestException('Domain registration not started')
    }

    const operation = await this.route53.getOperationDetail(operationId)

    if (operation.Status === OperationStatus.SUCCESSFUL) {
      await this.websites.update({
        where: { campaignId },
        data: { domainStatus: WebsiteDomainStatus.registered },
      })
    }

    return operation
  }
}
