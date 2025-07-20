import {
  Injectable,
  BadRequestException,
  ConflictException,
  Inject,
  forwardRef,
} from '@nestjs/common'
import { DomainAvailability } from '@aws-sdk/client-route-53-domains'
import { DomainStatus } from '@prisma/client'
import { PurchaseHandler, PurchaseMetadata } from '../purchase.types'
import { DomainsService } from '../../websites/services/domains.service'
import { PaymentsService } from '../services/payments.service'
import { UsersService } from '../../users/services/users.service'
import { RegisterDomainSchema } from '../../websites/schemas/RegisterDomain.schema'
import { GP_DOMAIN_CONTACT } from '../../aws/services/awsRoute53.service'

@Injectable()
export class DomainPurchaseHandler implements PurchaseHandler {
  constructor(
    @Inject(forwardRef(() => DomainsService))
    private readonly domainsService: DomainsService,
    private readonly paymentsService: PaymentsService,
    private readonly usersService: UsersService,
  ) {}

  private convertWebsiteIdToNumber(
    websiteId: number | string | undefined,
  ): number {
    if (websiteId === undefined || websiteId === null) {
      throw new BadRequestException('Website ID is required')
    }

    if (typeof websiteId === 'number') {
      return websiteId
    }

    const parsedId = parseInt(websiteId, 10)
    if (isNaN(parsedId)) {
      throw new BadRequestException('Invalid website ID format')
    }

    return parsedId
  }

  async validatePurchase(metadata: PurchaseMetadata): Promise<void> {
    const { domainName, websiteId } = metadata

    if (!domainName || !websiteId) {
      throw new BadRequestException('Domain name and website ID are required')
    }

    const searchResult = await this.domainsService.searchForDomain(domainName)

    if (searchResult.availability !== DomainAvailability.AVAILABLE) {
      throw new ConflictException('Domain not available')
    }
  }

  async calculateAmount(metadata: PurchaseMetadata): Promise<number> {
    const { domainName } = metadata

    const searchResult = await this.domainsService.searchForDomain(domainName!)

    if (!searchResult.prices.registration) {
      throw new BadRequestException('Could not get price for domain')
    }

    return searchResult.prices.registration * 100
  }

  async executePostPurchase(
    paymentIntentId: string,
    metadata: PurchaseMetadata,
  ): Promise<any> {
    const { domainName, websiteId } = metadata

    const paymentIntent =
      await this.paymentsService.retrievePayment(paymentIntentId)

    if (paymentIntent.status !== 'succeeded') {
      throw new BadRequestException(
        `Payment not completed. Status: ${paymentIntent.status}`,
      )
    }

    const userId = paymentIntent.metadata?.userId
    if (!userId) {
      throw new BadRequestException('No userId found in payment metadata')
    }

    const user = await this.usersService.findUser({
      id: parseInt(userId),
    })

    if (!user) {
      throw new BadRequestException('User not found for payment')
    }

    const validWebsiteId = this.convertWebsiteIdToNumber(websiteId)

    const domain = await this.domainsService.model.create({
      data: {
        websiteId: validWebsiteId,
        name: domainName!,
        price: paymentIntent.amount / 100,
        paymentId: paymentIntentId,
        status: DomainStatus.pending,
      },
    })

    const contactInfo = this.buildContactInfo(user)

    try {
      const operationId = await this.domainsService.completeDomainRegistration(
        validWebsiteId,
        contactInfo,
      )

      return {
        domain,
        operationId,
        message: 'Domain registration initiated with AWS',
      }
    } catch (error) {
      await this.domainsService.model.update({
        where: { id: domain.id },
        data: { status: DomainStatus.inactive },
      })

      throw new BadRequestException(
        `Failed to register domain with AWS: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
    }
  }

  private buildContactInfo(user: any): RegisterDomainSchema {
    // Use available user information, fallback to GP_DOMAIN_CONTACT for missing required fields
    return {
      firstName: user.firstName || GP_DOMAIN_CONTACT.FirstName!,
      lastName: user.lastName || GP_DOMAIN_CONTACT.LastName!,
      email: user.email,
      phoneNumber: user.phone || GP_DOMAIN_CONTACT.PhoneNumber!,
      addressLine1: user.address || GP_DOMAIN_CONTACT.AddressLine1!,
      addressLine2: '',
      city: user.city || GP_DOMAIN_CONTACT.City!,
      state: user.state || GP_DOMAIN_CONTACT.State!,
      zipCode: user.zip || GP_DOMAIN_CONTACT.ZipCode!,
    }
  }
}
