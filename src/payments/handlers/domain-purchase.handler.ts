import {
  Injectable,
  BadRequestException,
  ConflictException,
  Inject,
  forwardRef,
} from '@nestjs/common'
import { PurchaseHandler, PurchaseMetadata } from '../purchase.types'
import { DomainsService } from '../../websites/services/domains.service'
import { PaymentsService } from '../services/payments.service'
import { UsersService } from '../../users/services/users.service'
import { RegisterDomainSchema } from '../../websites/schemas/RegisterDomain.schema'

@Injectable()
export class DomainPurchaseHandler implements PurchaseHandler {
  constructor(
    @Inject(forwardRef(() => DomainsService))
    private readonly domainsService: DomainsService,
    private readonly paymentsService: PaymentsService,
    private readonly usersService: UsersService,
  ) {}

  async validatePurchase(metadata: PurchaseMetadata): Promise<void> {
    const { domainName, websiteId } = metadata

    if (!domainName || !websiteId) {
      throw new BadRequestException('Domain name and website ID are required')
    }

    const searchResult = await this.domainsService.searchForDomain(domainName)

    if (searchResult.availability !== 'AVAILABLE') {
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

    const domain = await this.domainsService.model.create({
      data: {
        websiteId:
          typeof websiteId === 'string' ? parseInt(websiteId) : websiteId!,
        name: domainName!,
        price: paymentIntent.amount / 100,
        paymentId: paymentIntentId,
        status: 'pending',
      },
    })

    const contactInfo = this.buildContactInfo(user)

    try {
      const operationId = await this.domainsService.completeDomainRegistration(
        typeof websiteId === 'string' ? parseInt(websiteId) : websiteId!,
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
        data: { status: 'inactive' },
      })

      throw new BadRequestException(
        `Failed to register domain with AWS: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
    }
  }

  private buildContactInfo(user: any): RegisterDomainSchema {
    // Use available user information, fallback to defaults for missing required fields
    return {
      firstName: user.firstName || 'Default',
      lastName: user.lastName || 'User',
      email: user.email,
      phoneNumber: user.phone || '0000000000', // Default phone if not provided
      addressLine1: '123 Default St', // TODO: Should be collected during purchase or from user profile
      addressLine2: '',
      city: 'Default City', // TODO: Should be collected during purchase or from user profile
      state: 'CA', // TODO: Should be collected during purchase or from user profile
      zipCode: user.zip || '00000',
    }
  }
}
