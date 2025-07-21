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
import { WebsitesService } from '../../websites/services/websites.service'
import { RegisterDomainSchema } from '../../websites/schemas/RegisterDomain.schema'
import { GP_DOMAIN_CONTACT } from '../../vercel/services/vercel.service'

@Injectable()
export class DomainPurchaseHandler implements PurchaseHandler {
  constructor(
    @Inject(forwardRef(() => DomainsService))
    private readonly domainsService: DomainsService,
    @Inject(forwardRef(() => PaymentsService))
    private readonly paymentsService: PaymentsService,
    private readonly usersService: UsersService,
    private readonly websitesService: WebsitesService,
  ) {}

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
    const contact = websiteContent?.contact as any

    return {
      firstName: user.firstName || user.name?.split(' ')[0] || 'Unknown',
      lastName:
        user.lastName || user.name?.split(' ').slice(1).join(' ') || 'User',
      email: user.email,
      phoneNumber: contact?.phone || GP_DOMAIN_CONTACT.phoneNumber,
      addressLine1: contact?.address1 || GP_DOMAIN_CONTACT.addressLine1,
      addressLine2: contact?.address2,
      city: contact?.city || GP_DOMAIN_CONTACT.city,
      state: contact?.state || GP_DOMAIN_CONTACT.state,
      zipCode: contact?.zip || GP_DOMAIN_CONTACT.zipCode,
    }
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

    if (!websiteId) {
      throw new BadRequestException(
        'Website ID is required for domain registration',
      )
    }

    const user = await this.usersService.findUser({
      id: parseInt(userId),
    })

    if (!user) {
      throw new BadRequestException('User not found for payment')
    }

    const validWebsiteId = this.convertWebsiteIdToNumber(websiteId)

    // Retrieve website content to get address information
    const website = await this.websitesService.findUniqueOrThrow({
      where: { id: validWebsiteId },
      select: { content: true },
    })

    const domain = await this.domainsService.model.create({
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
      const registrationResult =
        await this.domainsService.completeDomainRegistration(
          validWebsiteId,
          contactInfo,
        )

      return {
        domain,
        registrationResult,
        message: 'Domain registration initiated with Vercel',
      }
    } catch (error) {
      await this.domainsService.model.update({
        where: { id: domain.id },
        data: { status: DomainStatus.inactive },
      })

      throw new BadRequestException(
        `Failed to register domain with Vercel: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
    }
  }
}
