import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { AwsRoute53Service } from 'src/aws/services/awsRoute53.service'
import { WebsiteService } from './website.service'
import { WebsiteStatus } from '@prisma/client'
import { OperationStatus } from '@aws-sdk/client-route-53-domains'
import { RRType } from '@aws-sdk/client-route-53'
import { VercelService } from 'src/vercel/services/vercel.service'
import { VERCEL_DNS_IP } from 'src/vercel/vercel.const'

@Injectable()
export class DomainsService {
  private readonly logger = new Logger(DomainsService.name)

  constructor(
    private readonly route53: AwsRoute53Service,
    private readonly website: WebsiteService,
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

  // To be called after domain is selected, create website record in DB and await payment
  async startDomainRegistration(campaignId: number, domainName: string) {
    return await this.website.model.create({
      data: {
        domain: domainName,
        status: WebsiteStatus.pending,
        campaignId,
      },
    })
  }

  // To be called after payment is accepted, send registration request to AWS
  async completeDomainRegistration(campaignId: number) {
    const website = await this.website.model.findUniqueOrThrow({
      where: { campaignId },
    })

    const operationId = await this.route53.registerDomain(website.domain)

    await this.website.model.update({
      where: { campaignId },
      data: { operationId, status: WebsiteStatus.submitted },
    })

    // TODO: how to handle for polling status on server side?

    return operationId
  }

  async configureDomain(campaignId: number) {
    const website = await this.website.model.findUniqueOrThrow({
      where: { campaignId },
    })

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
    const website = await this.website.model.findUniqueOrThrow({
      where: { campaignId },
    })

    const operationId = website.operationId

    if (!operationId) {
      throw new BadRequestException('Domain registration not started')
    }

    const operation = await this.route53.getOperationDetail(operationId)

    if (operation.Status === OperationStatus.SUCCESSFUL) {
      await this.website.model.update({
        where: { campaignId },
        data: { status: WebsiteStatus.registered },
      })
    }

    return operation
  }
}
