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
import { RRType } from '@aws-sdk/client-route-53'
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

    // TODO: how to handle for polling status on server side?

    return operationId
  }

  async configureDomain(websiteId: number) {
    const domain = await this.findUniqueOrThrow({
      where: { websiteId },
    })

    // can only turn off auto renew after registration
    await this.route53.disableAutoRenew(domain.name)

    const route53Response = await this.route53.setDnsRecords(
      domain.name,
      RRType.A,
      VERCEL_DNS_IP, // point to Vercel's Anycast IP
    )
    this.logger.debug('Updated domain DNS record', route53Response.ChangeInfo)

    const vercelResponse = await this.vercel.addDomainToProject(domain.name)
    this.logger.debug('Added domain to Vercel project', vercelResponse)

    if (!vercelResponse.verified) {
      this.logger.warn(
        `Domain ${domain.name} added to Vercel but requires verification`,
        vercelResponse.verification,
      )
    }

    return vercelResponse
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
