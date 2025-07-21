import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common'
import { AwsRoute53Service } from 'src/aws/services/awsRoute53.service'
import { DomainStatus, User } from '@prisma/client'
import { DomainAvailability } from '@aws-sdk/client-route-53-domains'
import { VercelService } from 'src/vercel/services/vercel.service'
import { PaymentsService } from 'src/payments/services/payments.service'
import { PaymentType } from 'src/payments/payments.types'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { RegisterDomainSchema } from '../schemas/RegisterDomain.schema'
import { GP_DOMAIN_CONTACT } from 'src/vercel/vercel.const'
import { PurchaseHandler, PurchaseMetadata } from 'src/payments/purchase.types'

// Enum for payment statuses (based on Stripe Payment Intent statuses)
export enum PaymentStatus {
  REQUIRES_PAYMENT_METHOD = 'requires_payment_method',
  REQUIRES_CONFIRMATION = 'requires_confirmation',
  REQUIRES_ACTION = 'requires_action',
  PROCESSING = 'processing',
  REQUIRES_CAPTURE = 'requires_capture',
  CANCELED = 'canceled',
  SUCCEEDED = 'succeeded',
}

// Enum for domain operation statuses
export enum DomainOperationStatus {
  SUBMITTED = 'SUBMITTED',
  IN_PROGRESS = 'IN_PROGRESS',
  SUCCESSFUL = 'SUCCESSFUL',
  ERROR = 'ERROR',
  NO_DOMAIN = 'NO_DOMAIN',
}

export interface DomainStatusResponse {
  message: DomainOperationStatus
  paymentStatus: PaymentStatus | null
  operationDetail?: any
}

@Injectable()
export class DomainsService
  extends createPrismaBase(MODELS.Domain)
  implements PurchaseHandler
{
  constructor(
    private readonly route53: AwsRoute53Service,
    private readonly vercel: VercelService,
    private readonly payments: PaymentsService,
  ) {
    super()
  }

  async validatePurchase(metadata: PurchaseMetadata): Promise<void> {
    const { domainName, websiteId } = metadata

    if (!domainName || !websiteId) {
      throw new BadRequestException('Domain name and website ID are required')
    }

    const searchResult = await this.searchForDomain(domainName)

    if (searchResult.availability !== DomainAvailability.AVAILABLE) {
      throw new ConflictException('Domain not available')
    }
  }

  async calculateAmount(metadata: PurchaseMetadata): Promise<number> {
    const { domainName } = metadata

    if (!domainName) {
      throw new BadRequestException('Domain name is required')
    }

    const searchResult = await this.searchForDomain(domainName)

    if (!searchResult.prices.registration) {
      throw new BadRequestException('Could not get price for domain')
    }

    return searchResult.prices.registration * 100
  }

  async executePostPurchase(
    paymentIntentId: string,
    metadata: PurchaseMetadata,
  ): Promise<any> {
    return this.handleDomainPostPurchase(paymentIntentId, metadata)
  }

  async handleDomainPostPurchase(
    paymentIntentId: string,
    metadata: any,
  ): Promise<any> {
    const { domainName, websiteId } = metadata
    if (!websiteId) {
      throw new BadRequestException(
        'Website ID is required for domain registration',
      )
    }

    const { paymentIntent, user } =
      await this.payments.getValidatedPaymentUser(paymentIntentId)

    const validWebsiteId = this.convertWebsiteIdToNumber(websiteId)

    const website = await this.client.website.findUniqueOrThrow({
      where: { id: validWebsiteId },
      select: { content: true },
    })

    const domain = await this.model.create({
      data: {
        websiteId: validWebsiteId,
        name: domainName!,
        price: paymentIntent.amount / 100,
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

      throw new BadRequestException(
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
    user: any,
    websiteContent: any,
  ): RegisterDomainSchema {
    const address = websiteContent?.contact?.address
    return {
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phoneNumber: user.phone || '+1.0000000000',
      addressLine1: address?.addressLine1 || GP_DOMAIN_CONTACT.addressLine1,
      addressLine2: address?.addressLine2 || GP_DOMAIN_CONTACT.addressLine2,
      city: address?.city || GP_DOMAIN_CONTACT.city,
      state: address?.state || GP_DOMAIN_CONTACT.state,
      zipCode: address?.zipCode || GP_DOMAIN_CONTACT.zipCode,
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
          prices: {
            registration: price,
            renewal: price,
          },
        }
      }),
    )

    return {
      domainName,
      availability: availabilityResp.Availability,
      prices: {
        registration: searchedDomainPrice,
        renewal: searchedDomainPrice,
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

    if (!domain.price) {
      throw new BadGatewayException('Domain price not available')
    }

    const paymentIntent = await this.payments.createPayment(user, {
      type: PaymentType.DOMAIN_REGISTRATION,
      amount: domain.price.toNumber() * 100, // convert to cents
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

    try {
      const vercelResult = await this.vercel.purchaseDomain(
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

      const projectResult = await this.vercel.addDomainToProject(domain.name)

      await this.model.update({
        where: { id: domain.id },
        data: {
          operationId: `vercel-${domain.name}-${Date.now()}`,
          status: DomainStatus.submitted,
        },
      })

      return {
        vercelResult,
        projectResult,
        message: 'Domain registration completed with Vercel',
      }
    } catch (error) {
      this.logger.error('Error registering domain with Vercel:', error)

      await this.model.update({
        where: { id: domain.id },
        data: { status: DomainStatus.inactive },
      })

      throw new BadRequestException(
        `Failed to register domain with Vercel: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      )
    }
  }

  async configureDomain(websiteId: number) {
    const domain = await this.findUniqueOrThrow({
      where: { websiteId },
    })

    try {
      const verifyResult = await this.vercel.verifyProjectDomain(domain.name)
      this.logger.debug('Domain verification result:', verifyResult)

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
    } catch (error) {
      this.logger.error('Error configuring domain:', error)
      throw new BadRequestException(
        `Failed to configure domain: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      )
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
      return null
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
