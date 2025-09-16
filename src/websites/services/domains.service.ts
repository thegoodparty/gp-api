import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common'
import { AwsRoute53Service } from 'src/vendors/aws/services/awsRoute53.service'
import { Domain, DomainStatus, User } from '@prisma/client'
import { DomainAvailability } from '@aws-sdk/client-route-53-domains'
import { VercelService } from 'src/vendors/vercel/services/vercel.service'
import { PaymentsService } from 'src/payments/services/payments.service'
import { PaymentStatus, PaymentType } from 'src/payments/payments.types'
import { StripeService } from 'src/vendors/stripe/services/stripe.service'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { RegisterDomainSchema } from '../schemas/RegisterDomain.schema'
import { GP_DOMAIN_CONTACT } from 'src/vendors/vercel/vercel.const'
import { PurchaseHandler, PurchaseMetadata } from 'src/payments/purchase.types'
import { DomainPurchaseMetadata } from '../domains.types'
import { ForwardEmailService } from '../../vendors/forwardEmail/services/forwardEmail.service'
import { ForwardEmailDomainResponse } from '../../vendors/forwardEmail/forwardEmail.types' // Enum for domain operation statuses

// Enum for domain operation statuses
export enum DomainOperationStatus {
  SUBMITTED = 'SUBMITTED',
  IN_PROGRESS = 'IN_PROGRESS',
  SUCCESSFUL = 'SUCCESSFUL',
  ERROR = 'ERROR',
  NO_DOMAIN = 'NO_DOMAIN',
}

// Enum for domain operation types
export enum DomainOperationType {
  REGISTER_DOMAIN = 'RegisterDomain',
}

export interface DomainOperationDetail {
  operationId: string | null
  status: DomainOperationStatus
  type: DomainOperationType
  submittedDate: Date
}

export interface DomainStatusResponse {
  message: DomainOperationStatus
  paymentStatus: PaymentStatus | null
  operationDetail?: DomainOperationDetail
}

@Injectable()
export class DomainsService
  extends createPrismaBase(MODELS.Domain)
  implements PurchaseHandler<DomainPurchaseMetadata>
{
  constructor(
    private readonly route53: AwsRoute53Service,
    private readonly vercel: VercelService,
    private readonly payments: PaymentsService,
    private readonly stripe: StripeService,
    private readonly forwardEmailService: ForwardEmailService,
  ) {
    super()
  }

  private shouldEnableDomainPurchase(): boolean {
    return !this.stripe.isTestMode
  }

  private getDomainPurchaseStatus(): string {
    return this.stripe.isTestMode
      ? 'disabled because Stripe is in test mode'
      : 'enabled'
  }

  async validatePurchase(
    metadata: PurchaseMetadata<DomainPurchaseMetadata>,
  ): Promise<void> {
    const { domainName, websiteId } = metadata

    if (!domainName || !websiteId) {
      throw new BadRequestException('Domain name and website ID are required')
    }

    const searchResult = await this.searchForDomain(domainName)

    if (searchResult.availability !== DomainAvailability.AVAILABLE) {
      throw new ConflictException('Domain not available')
    }
  }

  async calculateAmount(
    metadata: PurchaseMetadata<DomainPurchaseMetadata>,
  ): Promise<number> {
    const { domainName } = metadata

    if (!domainName) {
      throw new BadRequestException('Domain name is required')
    }

    const searchResult = await this.searchForDomain(domainName)

    if (!searchResult.price) {
      throw new BadRequestException('Could not get price for domain')
    }

    return searchResult.price * 100
  }

  async executePostPurchase(
    paymentIntentId: string,
    metadata: PurchaseMetadata<DomainPurchaseMetadata>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    return this.handleDomainPostPurchase(paymentIntentId, metadata)
  }

  async handleDomainPostPurchase(
    paymentIntentId: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    metadata: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    const { domainName, websiteId } = metadata
    if (!websiteId) {
      throw new BadRequestException(
        'Website ID is required for domain registration',
      )
    }

    const { paymentIntent: _paymentIntent, user } =
      await this.payments.getValidatedPaymentUser(paymentIntentId)

    const validWebsiteId = this.convertWebsiteIdToNumber(websiteId)

    const website = await this.client.website.findUniqueOrThrow({
      where: { id: validWebsiteId },
      select: { content: true },
    })

    const searchResult = await this.searchForDomain(domainName!)

    if (!searchResult.price) {
      throw new BadRequestException('Could not get price for domain')
    }

    const domain = await this.model.create({
      data: {
        websiteId: validWebsiteId,
        name: domainName!,
        price: searchResult.price,
        paymentId: paymentIntentId,
        status: DomainStatus.pending,
      },
    })

    const contactInfo = this.buildContactInfo(user, website.content)

    try {
      const registrationResult = await this.completeDomainRegistration(
        validWebsiteId,
        contactInfo,
      )

      return {
        domain,
        registrationResult,
        message: 'Domain registration initiated with Vercel',
      }
    } catch (error) {
      await this.model.update({
        where: { id: domain.id },
        data: { status: DomainStatus.inactive },
      })

      throw new BadGatewayException(
        `Failed to register domain with Vercel: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
    }
  }

  private convertWebsiteIdToNumber(websiteId: string | number): number {
    if (typeof websiteId === 'string') {
      const parsed = parseInt(websiteId, 10)
      if (isNaN(parsed)) {
        throw new BadRequestException('Invalid website ID format')
      }
      return parsed
    }
    return websiteId
  }

  private buildContactInfo(
    user: User,
    websiteContent: PrismaJson.WebsiteContent | null,
  ): RegisterDomainSchema {
    const addressPlace = websiteContent?.contact?.addressPlace
    return {
      firstName: user.firstName || GP_DOMAIN_CONTACT.firstName,
      lastName: user.lastName || GP_DOMAIN_CONTACT.lastName,
      email: user.email || GP_DOMAIN_CONTACT.email,
      phoneNumber: user.phone || GP_DOMAIN_CONTACT.phoneNumber,
      addressLine1:
        addressPlace?.formatted_address || GP_DOMAIN_CONTACT.addressLine1,
      addressLine2: GP_DOMAIN_CONTACT.addressLine2,
      city:
        addressPlace?.address_components?.find((c) =>
          c.types.includes('locality'),
        )?.long_name || GP_DOMAIN_CONTACT.city,
      state:
        addressPlace?.address_components?.find((c) =>
          c.types.includes('administrative_area_level_1'),
        )?.short_name || GP_DOMAIN_CONTACT.state,
      zipCode:
        addressPlace?.address_components?.find((c) =>
          c.types.includes('postal_code'),
        )?.long_name || GP_DOMAIN_CONTACT.zipCode,
    }
  }

  async getDomainDetails(domainName: string) {
    return this.vercel.getDomainDetails(domainName)
  }

  async searchForDomain(domainName: string) {
    // Use AWS Route53 for domain availability and suggestions, but Vercel for pricing
    const [availabilityResp, suggestionsResp] = await Promise.all([
      this.route53.checkDomainAvailability(domainName),
      this.route53.getDomainSuggestions(domainName),
    ])

    // Get pricing from Vercel for the main domain
    let searchedDomainPrice: number | undefined
    try {
      const vercelPrice = await this.vercel.checkDomainPrice(domainName)
      searchedDomainPrice = vercelPrice.price
    } catch (error) {
      this.logger.warn(`Could not get Vercel price for ${domainName}:`, error)
    }

    const suggestions = suggestionsResp.SuggestionsList || []
    const suggestionsWithPrices = await Promise.all(
      suggestions.map(async (suggestion) => {
        let price: number | undefined
        try {
          if (suggestion.DomainName) {
            const vercelPrice = await this.vercel.checkDomainPrice(
              suggestion.DomainName,
            )
            price = vercelPrice.price
          }
        } catch (error) {
          this.logger.warn(
            `Could not get Vercel price for ${suggestion.DomainName}:`,
            error,
          )
        }

        return {
          ...suggestion,
          price: price,
        }
      }),
    )

    return {
      domainName,
      availability: availabilityResp.Availability,
      price: searchedDomainPrice,
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

    if (!searchResult.price) {
      throw new BadGatewayException('Could not get price for domain')
    }

    const domain = await this.model.create({
      data: {
        websiteId,
        name: domainName,
        price: searchResult.price,
      },
    })

    if (!domain.price) {
      throw new BadGatewayException('Domain price not available')
    }

    const paymentIntent = await this.payments.createPayment(user, {
      type: PaymentType.DOMAIN_REGISTRATION,
      amount: domain.price.toNumber() * 100,
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

  private async setupDomainEmailForwarding(
    domain: Domain,
    forwardingEmailAddress: string,
  ) {
    let forwardEmailDomain: ForwardEmailDomainResponse | null = null
    try {
      forwardEmailDomain = await this.forwardEmailService.addDomain(domain)
    } catch (e) {
      this.logger.error('Error adding domain to forward email service:', e)
      throw new Error('Error adding domain to forward email service:', {
        cause: e,
      })
    }
    this.logger.debug(`Domain added to ForwardEmail service: ${domain.name}`)

    try {
      await this.vercel.createMXRecords(domain.name)
    } catch (e) {
      this.logger.error('Error creating DNS MX records for domain:', e)
      throw new Error('Error creating DNS MX records for domain:', { cause: e })
    }
    this.logger.debug(`MX records created for domain ${domain.name}`)

    try {
      await this.vercel.createSPFRecord(domain.name, forwardEmailDomain!)
    } catch (e) {
      this.logger.error('Error creating SPF record for domain:', e)
      throw new Error('Error creating SPF record for domain:', { cause: e })
    }
    this.logger.debug(`SPF record created for domain ${domain.name}`)

    try {
      await this.forwardEmailService.createCatchAllAlias(
        forwardingEmailAddress,
        forwardEmailDomain!,
      )
    } catch (e) {
      this.logger.error(
        `catch-all alias not created for domain *@${domain.name} -> ${forwardingEmailAddress} :`,
        e,
      )
      throw new Error(
        `catch-all alias not created for domain *@${domain.name} -> ${forwardingEmailAddress} :`,
        { cause: e },
      )
    }
    return forwardEmailDomain
  }

  // called after payment is accepted, send registration request to Vercel
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

    if (!domain.price) {
      throw new BadRequestException('Domain price not available')
    }

    let vercelResult,
      projectResult,
      forwardEmailDomain: ForwardEmailDomainResponse | null = null

    if (this.shouldEnableDomainPurchase()) {
      try {
        vercelResult = await this.vercel.purchaseDomain(
          domain.name,
          {
            firstName: contact.firstName,
            lastName: contact.lastName,
            email: contact.email,
            phoneNumber: contact.phoneNumber,
            addressLine1: contact.addressLine1,
            addressLine2: contact.addressLine2,
            city: contact.city,
            state: contact.state,
            zipCode: contact.zipCode,
          },
          domain.price.toNumber(),
        )

        projectResult = await this.vercel.addDomainToProject(domain.name)
      } catch (error) {
        this.logger.error('Error registering domain with Vercel:', error)

        await this.model.update({
          where: { id: domain.id },
          data: { status: DomainStatus.inactive },
        })

        throw new BadGatewayException(
          `Failed to register domain with Vercel: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`,
        )
      }

      try {
        forwardEmailDomain = await this.setupDomainEmailForwarding(
          domain,
          contact.email,
        )
        this.logger.debug(
          `Email forwarding set up for domain *@${domain.name} -> ${contact.email}`,
        )
      } catch (e) {
        this.logger.error(
          `Error setting up email forwarding for domain *@${domain.name} -> ${contact.email} :`,
        )
        // Not throwing an error here to allow for continued execution
      }
    } else {
      this.logger.debug(
        `Domain purchase disabled for ${domain.name} - ${this.getDomainPurchaseStatus()}`,
      )
    }

    await this.model.update({
      where: { id: domain.id },
      data: {
        operationId: `vercel-${domain.name}-${Date.now()}`,
        status: DomainStatus.submitted,
        ...(forwardEmailDomain
          ? { emailForwardingDomainId: forwardEmailDomain.id }
          : {}),
      },
    })

    const message = this.shouldEnableDomainPurchase()
      ? 'Enabled'
      : `Disabled - Stripe is in test mode`

    return {
      vercelResult,
      projectResult,
      message,
    }
  }

  async configureDomain(websiteId: number) {
    const domain = await this.findUniqueOrThrow({
      where: { websiteId },
    })

    let verifyResult

    try {
      verifyResult = await this.vercel.verifyProjectDomain(domain.name)
      this.logger.debug('Domain verification result:', verifyResult)
    } catch (error) {
      this.logger.error('Error configuring domain:', error)
      throw new BadGatewayException(
        `Failed to configure domain: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      )
    }

    await this.model.update({
      where: { id: domain.id },
      data: { status: DomainStatus.registered },
    })

    return {
      domain: domain.name,
      verified: verifyResult,
      status: 'configured',
      message: 'Domain configured successfully with Vercel',
    }
  }

  async getPaymentStatus(paymentId: string): Promise<PaymentStatus | null> {
    try {
      const paymentIntent = await this.payments.retrievePayment(paymentId)
      return paymentIntent.status as PaymentStatus
    } catch (error) {
      this.logger.warn(
        `Failed to retrieve payment status for ${paymentId}:`,
        error,
      )

      // Handle different error types appropriately
      if (error instanceof Error) {
        const errorMessage = error.message.toLowerCase()

        // Stripe returns specific error types for different scenarios
        if (
          errorMessage.includes('no such payment_intent') ||
          errorMessage.includes('not found') ||
          (error as any).code === 'resource_missing'
        ) {
          // Payment doesn't exist - this might be acceptable in some cases
          // Return null to maintain backward compatibility for now
          return null
        }

        // Network/service issues with Stripe
        if (
          errorMessage.includes('network') ||
          errorMessage.includes('timeout') ||
          errorMessage.includes('service') ||
          (error as any).code === 'api_connection_error'
        ) {
          throw new BadGatewayException(
            `Stripe service unavailable: ${error.message}`,
          )
        }

        // Invalid payment ID format
        if (
          errorMessage.includes('invalid') ||
          (error as any).code === 'invalid_request_error'
        ) {
          throw new BadRequestException(
            `Invalid payment ID format: ${error.message}`,
          )
        }
      }

      // For any other unknown errors, treat as gateway issue
      throw new BadGatewayException(
        `Unable to retrieve payment status: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
    }
  }

  async getDomainWithPayment(websiteId: number) {
    return this.findFirst({
      where: { websiteId },
      select: {
        id: true,
        name: true,
        price: true,
        status: true,
        paymentId: true,
        operationId: true,
      },
    })
  }

  async updateDomainStatusToRegistered(domainId: number) {
    return this.model.update({
      where: { id: domainId },
      data: { status: DomainStatus.registered },
    })
  }

  async deleteDomain(websiteId: number) {
    const domain = await this.findUniqueOrThrow({
      where: { websiteId },
    })

    // Remove domain from Vercel project if it's active
    if (
      domain.status === DomainStatus.registered ||
      domain.status === DomainStatus.submitted
    ) {
      try {
        await this.vercel.removeDomainFromProject(domain.name)
      } catch (error) {
        this.logger.warn(
          `Failed to remove domain from Vercel project: ${error}`,
        )
      }
    }

    await this.model.delete({
      where: { id: domain.id },
    })

    return { message: 'Domain deleted successfully' }
  }
}
