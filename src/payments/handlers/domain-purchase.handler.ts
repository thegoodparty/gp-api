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

@Injectable()
export class DomainPurchaseHandler implements PurchaseHandler {
  constructor(
    @Inject(forwardRef(() => DomainsService))
    private readonly domainsService: DomainsService,
    private readonly paymentsService: PaymentsService,
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

    const domain = await this.domainsService.model.create({
      data: {
        websiteId: websiteId!,
        name: domainName!,
        price: paymentIntent.amount / 100,
        paymentId: paymentIntentId,
        status: 'pending',
      },
    })

    return { domain, message: 'Domain registration initiated' }
  }
}
