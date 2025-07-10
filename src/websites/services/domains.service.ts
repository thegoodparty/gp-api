import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common'
import { AwsRoute53Service } from 'src/aws/services/awsRoute53.service'
import { formatPhoneNumber } from 'src/aws/util/awsRoute53.util'
import { DomainStatus, User } from '@prisma/client'
import {
  ContactType,
  CountryCode,
  DomainAvailability,
  OperationStatus,
} from '@aws-sdk/client-route-53-domains'
import { CloudflareService } from 'src/cloudflare/services/cloudflare.service'
import { VercelService } from 'src/vercel/services/vercel.service'
import { VERCEL_DNS_IP } from 'src/vercel/vercel.const'
import { PaymentsService } from 'src/payments/services/payments.service'
import { PaymentType } from 'src/payments/payments.types'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { RegisterDomainSchema } from '../schemas/RegisterDomain.schema'

@Injectable()
export class DomainsService extends createPrismaBase(MODELS.Domain) {
  constructor(
    private readonly route53: AwsRoute53Service,
    private readonly cloudflare: CloudflareService,
    private readonly vercel: VercelService,
    private readonly payments: PaymentsService,
  ) {
    super()
  }

  async getDomainDetails(domainName: string) {
    return this.route53.getDomainDetails(domainName)
  }

  async searchForDomain(domainName: string) {
    const [availabilityResp, suggestionsResp, allPricesResp] =
      await Promise.all([
        this.route53.checkDomainAvailability(domainName),
        this.route53.getDomainSuggestions(domainName),
        this.route53.listPrices(),
      ])

    const allPricesMap = new Map()
    allPricesResp?.Prices?.forEach((price) => {
      if (price.Name && price.RegistrationPrice?.Price) {
        allPricesMap.set(price.Name, {
          registrationPrice: price.RegistrationPrice.Price,
          renewalPrice: price.RenewalPrice?.Price,
        })
      }
    })

    const searchedTld = domainName.split('.').at(-1)
    const searchedTldPrices = allPricesMap.get(searchedTld)

    const suggestions = suggestionsResp.SuggestionsList || []
    const suggestionsWithPrices = suggestions.map((suggestion) => {
      const suggestionTld = suggestion.DomainName?.split('.').at(-1)
      const prices = allPricesMap.get(suggestionTld)

      return {
        ...suggestion,
        prices: {
          registration: prices?.registrationPrice,
          renewal: prices?.renewalPrice,
        },
      }
    })

    return {
      domainName,
      availability: availabilityResp.Availability,
      prices: {
        registration: searchedTldPrices?.registrationPrice,
        renewal: searchedTldPrices?.renewalPrice,
      },
      suggestions: suggestionsWithPrices,
    }
  }

  async startDomainRegistration(
    user: User,
    websiteId: number,
    domainName: string,
  ) {
    const searchResult = await this.searchForDomain(domainName)

    if (searchResult.availability !== DomainAvailability.AVAILABLE) {
      throw new ConflictException('Domain not available')
    }

    if (!searchResult.prices.registration) {
      throw new BadGatewayException('Could not get price for domain')
    }

    const domain = await this.model.create({
      data: {
        websiteId,
        name: domainName,
        price: searchResult.prices.registration,
      },
    })

    const paymentIntent = await this.payments.createPayment(user, {
      type: PaymentType.DOMAIN_REGISTRATION,
      amount: domain.price! * 100, // convert to cents
      domainName,
      domainId: domain.id,
    })

    await this.model.update({
      where: { id: domain.id },
      data: { paymentId: paymentIntent.id, status: DomainStatus.pending },
    })

    return {
      domain,
      paymentSecret: paymentIntent.client_secret,
    }
  }

  // called after payment is accepted, send registration request to AWS
  async completeDomainRegistration(
    websiteId: number,
    contact: RegisterDomainSchema,
  ) {
    const domain = await this.findUniqueOrThrow({
      where: { websiteId },
    })

    if (!domain.paymentId) {
      throw new BadRequestException('No payment ID found for domain')
    }

    const paymentIntent = await this.payments.retrievePayment(domain.paymentId)

    if (paymentIntent.status !== 'succeeded') {
      throw new BadRequestException(
        `Payment not completed. Current status: ${paymentIntent.status}`,
      )
    }

    const operationId = await this.route53.registerDomain(domain.name, {
      FirstName: contact.firstName,
      LastName: contact.lastName,
      ContactType: ContactType.PERSON,
      Email: contact.email,
      PhoneNumber: formatPhoneNumber(contact.phoneNumber),
      AddressLine1: contact.addressLine1,
      AddressLine2: contact.addressLine2,
      City: contact.city,
      State: contact.state,
      CountryCode: CountryCode.US,
      ZipCode: contact.zipCode,
    })

    await this.model.update({
      where: { id: domain.id },
      data: { operationId, status: DomainStatus.submitted },
    })

    // After successful Route53 registration, immediately set up Cloudflare zone
    try {
      await this.setupCloudflareZone(domain.name)
      this.logger.debug(`Cloudflare zone setup initiated for ${domain.name}`)
    } catch (error) {
      this.logger.warn(
        `Failed to setup Cloudflare zone for ${domain.name}:`,
        error,
      )
      // Don't fail the registration if Cloudflare setup fails
    }

    return operationId
  }

  /**
   * Sets up a new Cloudflare zone for the domain
   * @param domainName - The domain name to setup
   * @returns The created Cloudflare zone
   */
  private async setupCloudflareZone(domainName: string) {
    const { CLOUDFLARE_ACCOUNT_ID } = process.env

    if (!CLOUDFLARE_ACCOUNT_ID) {
      throw new Error('CLOUDFLARE_ACCOUNT_ID is not set in ENV')
    }

    // Create zone in Cloudflare
    const zone = await this.cloudflare.createZone(
      domainName,
      CLOUDFLARE_ACCOUNT_ID,
    )

    this.logger.debug(`Created Cloudflare zone for ${domainName}`, {
      zoneId: zone.id,
      nameServers: zone.name_servers,
    })

    return zone
  }

  async configureDomain(websiteId: number) {
    const domain = await this.findUniqueOrThrow({
      where: { websiteId },
    })

    // can only turn off auto renew after registration
    await this.route53.disableAutoRenew(domain.name)

    // Get or create Cloudflare zone
    let zone = await this.cloudflare.getZoneByName(domain.name)

    if (!zone) {
      this.logger.debug(`Zone not found for ${domain.name}, creating new zone`)
      zone = await this.setupCloudflareZone(domain.name)
    }

    // Create A record pointing to Vercel
    await this.cloudflare.createARecord(
      zone.id,
      domain.name, // Use full domain name for root record
      VERCEL_DNS_IP,
      300, // 5 minutes TTL
    )

    this.logger.debug(`Created A record for ${domain.name} -> ${VERCEL_DNS_IP}`)

    // Add domain to Vercel project
    const vercelResponse = await this.vercel.addDomainToProject(domain.name)
    this.logger.debug('Added domain to Vercel project', vercelResponse)

    if (!vercelResponse.verified) {
      this.logger.warn(
        `Domain ${domain.name} added to Vercel but requires verification`,
        vercelResponse.verification,
      )
    }

    return {
      cloudflareZone: {
        id: zone.id,
        nameServers: zone.name_servers,
        status: zone.status,
      },
      vercel: vercelResponse,
    }
  }

  /**
   * Creates domain masking/redirect rules using Cloudflare
   * @param websiteId - The website ID
   * @param redirectUrl - The URL to redirect to
   * @param statusCode - HTTP status code for redirect (301 or 302)
   */
  async createDomainMasking(
    websiteId: number,
    redirectUrl: string,
    statusCode: number = 301,
  ) {
    const domain = await this.findUniqueOrThrow({
      where: { websiteId },
    })

    const zone = await this.cloudflare.getZoneByName(domain.name)

    if (!zone) {
      throw new BadRequestException(
        `Cloudflare zone not found for domain ${domain.name}`,
      )
    }

    // Create page rule for domain masking
    const pageRule = await this.cloudflare.createPageRule(
      zone.id,
      `${domain.name}/*`,
      redirectUrl,
      statusCode,
    )

    this.logger.debug(
      `Created domain masking rule for ${domain.name} -> ${redirectUrl}`,
    )

    return pageRule
  }

  /**
   * Lists DNS records for the domain
   * @param websiteId - The website ID
   */
  async listDNSRecords(websiteId: number) {
    const domain = await this.findUniqueOrThrow({
      where: { websiteId },
    })

    const zone = await this.cloudflare.getZoneByName(domain.name)

    if (!zone) {
      throw new BadRequestException(
        `Cloudflare zone not found for domain ${domain.name}`,
      )
    }

    return this.cloudflare.listDNSRecords(zone.id)
  }

  async checkRegistrationStatus(websiteId: number) {
    const domain = await this.findUniqueOrThrow({
      where: { websiteId },
    })

    const operationId = domain.operationId

    if (!operationId) {
      throw new BadRequestException('Domain registration not started')
    }

    const operation = await this.route53.getOperationDetail(operationId)

    if (operation.Status === OperationStatus.SUCCESSFUL) {
      await this.model.update({
        where: { id: domain.id },
        data: { status: DomainStatus.registered },
      })
    }

    return operation
  }
}
