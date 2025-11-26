import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  HttpStatus,
  Injectable,
} from '@nestjs/common'
import { AwsRoute53Service } from 'src/vendors/aws/services/awsRoute53.service'
import { Domain, DomainStatus, User } from '@prisma/client'
import { DomainAvailability } from '@aws-sdk/client-route-53-domains'
import {
  FORWARDEMAIL_MX1_VALUE,
  FORWARDEMAIL_MX2_VALUE,
  FORWARDEMAIL_TXT_VALUE_PREFIX,
  VercelDnsRecordType,
  VercelService,
} from 'src/vendors/vercel/services/vercel.service'
import { PaymentsService } from 'src/payments/services/payments.service'
import { PaymentStatus } from 'src/payments/payments.types'
import { StripeService } from 'src/vendors/stripe/services/stripe.service'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { RegisterDomainSchema } from '../schemas/RegisterDomain.schema'
import { GP_DOMAIN_CONTACT } from 'src/vendors/vercel/vercel.const'
import { PurchaseHandler, PurchaseMetadata } from 'src/payments/purchase.types'
import { DomainPurchaseMetadata, DomainSearchResult } from '../domains.types'
import { ForwardEmailService } from '../../vendors/forwardEmail/services/forwardEmail.service'
import { ForwardEmailDomainResponse } from '../../vendors/forwardEmail/forwardEmail.types'
import { QueueProducerService } from '../../queue/producer/queueProducer.service'
import { Timeout } from '@nestjs/schedule'
import { MessageGroup, QueueType } from '../../queue/queue.types'
import { AddProjectDomainResponseBody } from '@vercel/sdk/models/addprojectdomainop'
import { BuySingleDomainResponseBody } from '@vercel/sdk/models/buysingledomainop'
import { GetDomainResponseBody } from '@vercel/sdk/models/getdomainop'
import { Records } from '@vercel/sdk/models/getrecordsop'
import { GetProjectDomainResponseBody } from '@vercel/sdk/models/getprojectdomainop'
import { isAxiosError } from 'axios'
import { VerifyProjectDomainResponseBody } from '@vercel/sdk/models/verifyprojectdomainop'

const { ENABLE_DOMAIN_SETUP } = process.env

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
    private queueService: QueueProducerService,
  ) {
    super()
  }

  // This will attempt to setup domain email forwarding for domains that have not yet done so.
  @Timeout(0)
  private async backfillDomainEmailRedirects() {
    if (!this.shouldEnableDomainPurchase()) {
      this.logger.debug(': Domain purchase disabled - skipping backfill')
      return
    }
    const domains = await this.model.findMany({
      where: {
        emailForwardingDomainId: null,
      },
      include: {
        website: {
          include: {
            campaign: {
              include: {
                user: true,
              },
            },
          },
        },
      },
    })

    for (const { id: domainId, website } of domains) {
      const { campaign } = website
      const { user } = campaign
      const { email: forwardingEmailAddress } = user!
      const messageData = {
        domainId,
        forwardingEmailAddress,
      }
      this.logger.debug(
        `Found domain with no email forwarding, enqueuing task: ${JSON.stringify(messageData)}`,
      )
      await this.queueService.sendMessage(
        {
          type: QueueType.DOMAIN_EMAIL_FORWARDING,
          data: {
            domainId,
            forwardingEmailAddress,
          },
        },
        MessageGroup.domainEmailRedirect,
      )
    }
  }

  shouldEnableDomainPurchase(): boolean {
    return ENABLE_DOMAIN_SETUP === 'true'
  }

  private validateDomainSearchResult(searchResult: DomainSearchResult) {
    if (!searchResult.price) {
      throw new BadRequestException(
        `Could not get price for domain search result: ${searchResult}`,
      )
    }
    return searchResult
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
    const validatedResult = this.validateDomainSearchResult(searchResult)

    return validatedResult.price! * 100
  }

  async executePostPurchase(
    paymentIntentId: string,
    metadata: PurchaseMetadata<DomainPurchaseMetadata>,
  ): Promise<{
    domain: Domain
    registrationResult: {
      vercelResult: GetDomainResponseBody | BuySingleDomainResponseBody | null
      projectResult: AddProjectDomainResponseBody | null
      message: string
    }
    message: string
  }> {
    return this.handleDomainPostPurchase(paymentIntentId, metadata)
  }

  async handleDomainPostPurchase(
    paymentIntentId: string,
    metadata: PurchaseMetadata<DomainPurchaseMetadata>,
  ): Promise<{
    domain: Domain
    registrationResult: {
      vercelResult: GetDomainResponseBody | BuySingleDomainResponseBody | null
      projectResult: AddProjectDomainResponseBody | null
      message: string
    }
    message: string
  }> {
    const { domainName, websiteId } = metadata
    if (!websiteId) {
      throw new BadRequestException(
        'Website ID is required for domain registration',
      )
    }

    const result = await this.payments.getValidatedPaymentUser(paymentIntentId)
    const user = result.user

    const validWebsiteId = this.convertWebsiteIdToNumber(websiteId)

    const website = await this.client.website.findUniqueOrThrow({
      where: { id: validWebsiteId },
      select: { content: true },
    })

    const searchResult = await this.searchForDomain(domainName!)

    const domain = await this.model.create({
      data: {
        websiteId: validWebsiteId,
        name: domainName!,
        price: this.validateDomainSearchResult(searchResult).price,
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

  async searchForDomain(domainName: string): Promise<DomainSearchResult> {
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

  async setupDomainEmailForwarding(
    domain: Domain,
    forwardingEmailAddress: string,
  ) {
    let forwardEmailDomain: ForwardEmailDomainResponse | null = null
    let existingForwardEmailDomain: ForwardEmailDomainResponse | null = null
    try {
      existingForwardEmailDomain = await this.forwardEmailService.getDomain(
        domain.name,
      )
      if (existingForwardEmailDomain) {
        this.logger.debug(
          `Domain ${domain.name} already exists in ForwardEmail service, skipping domain creation`,
        )
      }
      forwardEmailDomain = existingForwardEmailDomain
    } catch (e) {
      if (isAxiosError(e) && e.status !== HttpStatus.NOT_FOUND) {
        this.logger.error('Error adding domain to forward email service:', e)
        throw new Error('Error adding domain to forward email service:', {
          cause: e,
        })
      }
    }
    if (!forwardEmailDomain) {
      try {
        forwardEmailDomain = await this.forwardEmailService.addDomain(domain)
      } catch (e) {
        this.logger.error('Error adding domain to forward email service:', e)
        throw new Error('Error adding domain to forward email service:', {
          cause: e,
        })
      }
    }

    this.logger.debug(`Domain added to ForwardEmail service: ${domain.name}`)

    let dnsRecords: Records[] = []
    try {
      dnsRecords = await this.vercel.listDnsRecords(domain.name)
    } catch (e) {
      this.logger.error('Error listing DNS records for domain:', e)
    }

    try {
      const mxRecords = dnsRecords.filter(
        (r: Records) =>
          r.type === VercelDnsRecordType.Mx &&
          [FORWARDEMAIL_MX1_VALUE, FORWARDEMAIL_MX2_VALUE].includes(r.value),
      )
      if (mxRecords.length === 2) {
        this.logger.debug(
          `MX records already exist for domain ${domain.name}, skipping MX record creation`,
        )
      } else {
        await this.vercel.createMXRecords(domain.name)
      }
    } catch (e) {
      this.logger.error('Error creating DNS MX records for domain:', e)
      throw new Error('Error creating DNS MX records for domain:', { cause: e })
    }
    this.logger.debug(`MX records created for domain ${domain.name}`)

    try {
      const txtVerificationRecord = dnsRecords.find(
        (r: Records) =>
          r.type === VercelDnsRecordType.Txt &&
          r.value ===
            `${FORWARDEMAIL_TXT_VALUE_PREFIX}${forwardEmailDomain.verification_record}`,
      )
      if (txtVerificationRecord) {
        this.logger.debug(
          `TXT verification record already exists for domain ${domain.name}, skipping TXT verification record creation`,
        )
      } else {
        await this.vercel.createTXTVerificationRecord(
          domain.name,
          forwardEmailDomain!,
        )
      }
    } catch (e) {
      this.logger.error('Error creating TXT verification record for domain:', e)
      throw new Error('Error creating TXT verification record for domain:', {
        cause: e,
      })
    }
    this.logger.debug(
      `TXT verification record created for domain ${domain.name}`,
    )

    try {
      const existingAliases =
        await this.forwardEmailService.getCatchAllDomainAliases(domain.name)
      if (existingAliases.length > 0) {
        this.logger.debug(
          `Catch-all alias already exists for domain *@${domain.name} -> ${forwardingEmailAddress}, updating recipient address(es) to ${forwardingEmailAddress}`,
        )
        await Promise.all(
          existingAliases.map((alias) =>
            this.forwardEmailService.updateDomainAlias(
              alias.id,
              forwardingEmailAddress,
              forwardEmailDomain!,
            ),
          ),
        )
        this.logger.debug(
          `Catch-all alias updated for domain *@${domain.name} -> ${forwardingEmailAddress}`,
        )
      } else {
        await this.forwardEmailService.createCatchAllAlias(
          forwardingEmailAddress,
          forwardEmailDomain!,
        )
        this.logger.debug(
          `Catch-all alias created for domain *@${domain.name} -> ${forwardingEmailAddress}`,
        )
      }
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
  // TODO: This should be attempted BEFORE payment is taken. If this fails for some reason,
  //  we've already taken the customer's $$ and not would need a mechanism to refund
  //  them.  This is backwards
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

    let vercelResult:
        | GetDomainResponseBody
        | BuySingleDomainResponseBody
        | null = null,
      existingDomain: GetDomainResponseBody | null = null,
      projectResult: AddProjectDomainResponseBody | null = null,
      forwardEmailDomain: ForwardEmailDomainResponse | null = null

    if (this.shouldEnableDomainPurchase()) {
      try {
        existingDomain = await this.vercel.getDomainDetails(domain.name)
        if (existingDomain) {
          this.logger.debug(
            `Domain ${domain.name} already exists in Vercel, skipping registration`,
          )
        }
      } catch (e) {
        if (!this.vercel.isVercelNotFoundError(e)) {
          this.logger.error(`Error getting domain details from Vercel: ${e}`)
          throw new Error('Error getting domain details from Vercel:', {
            cause: e,
          })
        }
      }

      try {
        vercelResult =
          existingDomain ||
          (await this.vercel.purchaseDomain(
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
          ))
        let existingProjectDomain: GetProjectDomainResponseBody | null = null
        try {
          existingProjectDomain = await this.vercel.getProjectDomain(
            domain.name,
          )
          if (existingProjectDomain) {
            this.logger.debug(
              `Project Domain ${domain.name} already exists in Vercel project, skipping attachment to project`,
            )
          }
        } catch (e) {
          if (!this.vercel.isVercelNotFoundError(e)) {
            this.logger.error(`Error getting project domain from Vercel: ${e}`)
            throw new Error('Error getting project domain from Vercel: ', {
              cause: e,
            })
          }
        }
        projectResult =
          existingProjectDomain ||
          (await this.vercel.addDomainToProject(domain.name))
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
          `Error setting up email forwarding for domain *@${domain.name} -> ${contact.email} : ${e instanceof Error ? e.message : 'error unknown'}`,
        )
        // Not throwing an error here to allow for continued execution
      }
    } else {
      this.logger.debug(`Domain purchase disabled for ${domain.name}`)
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
      : `Disabled - Environment not enabled for domain setup`

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

    let verifyResult: VerifyProjectDomainResponseBody

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
        const errorCode =
          'code' in error ? (error as Record<string, string>).code : null

        if (
          errorMessage.includes('no such payment_intent') ||
          errorMessage.includes('not found') ||
          errorCode === 'resource_missing'
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
          errorCode === 'api_connection_error'
        ) {
          throw new BadGatewayException(
            `Stripe service unavailable: ${error.message}`,
          )
        }

        // Invalid payment ID format
        if (
          errorMessage.includes('invalid') ||
          errorCode === 'invalid_request_error'
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
