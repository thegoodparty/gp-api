import { DomainAvailability } from '@aws-sdk/client-route-53-domains'
import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Timeout } from '@nestjs/schedule'
import { Campaign, Domain, DomainStatus, User, Website } from '@prisma/client'
import { AddProjectDomainResponseBody } from '@vercel/sdk/models/addprojectdomainop'
import { BuySingleDomainResponseBody } from '@vercel/sdk/models/buysingledomainop'
import { GetDomainResponseBody } from '@vercel/sdk/models/getdomainop'
import { GetProjectDomainResponseBody } from '@vercel/sdk/models/getprojectdomainop'
import { Records } from '@vercel/sdk/models/getrecordsop'
import { VerifyProjectDomainResponseBody } from '@vercel/sdk/models/verifyprojectdomainop'
import { isAxiosError } from 'axios'
import { PaymentStatus } from 'src/payments/payments.types'
import { PurchaseHandler } from 'src/payments/purchase.types'
import { PaymentsService } from 'src/payments/services/payments.service'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { AwsRoute53Service } from 'src/vendors/aws/services/awsRoute53.service'
import { StripeService } from 'src/vendors/stripe/services/stripe.service'
import {
  FORWARDEMAIL_MX1_VALUE,
  FORWARDEMAIL_MX2_VALUE,
  FORWARDEMAIL_TXT_VALUE_PREFIX,
  VercelDnsRecordType,
  VercelService,
} from 'src/vendors/vercel/services/vercel.service'
import { GP_DOMAIN_CONTACT } from 'src/vendors/vercel/vercel.const'
import Stripe from 'stripe'
import { QueueProducerService } from '../../queue/producer/queueProducer.service'
import { MessageGroup, QueueType } from '../../queue/queue.types'
import { ForwardEmailDomainResponse } from '../../vendors/forwardEmail/forwardEmail.types'
import { ForwardEmailService } from '../../vendors/forwardEmail/services/forwardEmail.service'
import { AnalyticsService } from 'src/analytics/analytics.service'
import { EVENTS } from 'src/vendors/segment/segment.types'
import {
  DomainPurchaseMetadata,
  DomainSearchResult,
  PatternedDomainCandidate,
  PatternedDomainSearchResult,
} from '../domains.types'
import { RegisterDomainSchema } from '../schemas/RegisterDomain.schema'
import {
  expandDomainPatterns,
  PatternExpansionLimitError,
} from '../util/domainPatterns.util'
import { parseIsoDateAsUTC } from '@/shared/util/date.util'

const MAX_PATTERN_CANDIDATES = 50

const SUPPORTED_TLDS = ['com', 'org', 'vote'] as const

const DOMAIN_PURCHASE_ADVISORY_LOCK_KEY = 918_275

const DOMAIN_RESERVATION_KIND = {
  IDEMPOTENT: 'idempotent',
  CREATED: 'created',
} as const

const DOMAIN_PURCHASE_IN_PROGRESS_MESSAGE =
  'Domain registration already in progress for this campaign'

const GP_CAMPAIGN_DOMAIN_FORWARD_ADDRESS = 'candidate-domains@goodparty.org'

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
    private readonly analytics: AnalyticsService,
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
        status: {
          in: [DomainStatus.submitted, DomainStatus.registered],
        },
      },
    })

    for (const { id: domainId } of domains) {
      const messageData = { domainId }
      this.logger.debug(
        { messageData },
        'Found domain with no email forwarding, enqueuing task:',
      )
      await this.queueService.sendMessage(
        {
          type: QueueType.DOMAIN_EMAIL_FORWARDING,
          data: { domainId },
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
    metadata: DomainPurchaseMetadata,
  ): Promise<void | Stripe.PaymentIntent> {
    const { domainName, websiteId } = metadata

    if (!domainName || !websiteId) {
      throw new BadRequestException('Domain name and website ID are required')
    }

    const domain = await this.model.findFirst({
      where: {
        name: domainName,
        websiteId: this.convertWebsiteIdToNumber(websiteId),
      },
    })

    if (domain && domain.paymentId) {
      const paymentIntent = await this.payments.retrievePayment(
        domain.paymentId,
      )
      if (paymentIntent.status === 'succeeded') {
        return paymentIntent
      }
    }

    const searchResult = await this.searchForDomain(domainName)

    if (searchResult.availability !== DomainAvailability.AVAILABLE) {
      throw new ConflictException('Domain not available')
    }
  }

  async calculateAmount(metadata: DomainPurchaseMetadata): Promise<number> {
    const { domainName } = metadata

    if (!domainName) {
      throw new BadRequestException('Domain name is required')
    }

    const searchResult = await this.searchForDomain(domainName)
    const validatedResult = this.validateDomainSearchResult(searchResult)

    return validatedResult.price! * 100
  }

  /**
   * Post-purchase handler for Checkout Session-based domain purchases.
   * This is the preferred flow that supports promo codes.
   */

  async handleDomainPostPurchase(
    sessionId: string,
    metadata: DomainPurchaseMetadata & { userId?: string },
  ): Promise<{
    domain: Domain
    registrationResult: {
      vercelResult: GetDomainResponseBody | BuySingleDomainResponseBody | null
      projectResult: AddProjectDomainResponseBody | null
      message: string
    }
    message: string
  }> {
    const { domainName, websiteId, userId } = metadata
    if (!websiteId) {
      throw new BadRequestException(
        'Website ID is required for domain registration',
      )
    }

    if (!domainName) {
      throw new BadRequestException(
        'Domain name is required for domain registration',
      )
    }

    if (!userId) {
      throw new BadRequestException(
        'User ID is required for domain registration',
      )
    }

    // Retrieve the checkout session to get the PaymentIntent ID.
    // Domain purchases always have a non-zero amount (price comes from Vercel/Route53),
    // so they always go through Stripe — the zero-amount path in PurchaseService
    // (which generates synthetic free_ IDs) is only reachable for TEXT purchases
    // with a free texts offer.
    //
    // Even when a Stripe promo code reduces the total to $0, Stripe still creates
    // a real PaymentIntent in `payment` mode (payment_method_collection defaults
    // to `always` and `if_required` is subscription-only). The null check below
    // is a defensive guard for any unexpected Stripe behavior.
    const session = await this.stripe.retrieveCheckoutSession(sessionId)
    // Stripe SDK uses broad union types — cannot narrow without runtime expandable-field check
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const paymentIntentId = session.payment_intent as string
    if (!paymentIntentId) {
      throw new BadRequestException(
        'No payment intent found for checkout session',
      )
    }

    // Get user from metadata (validation already done in completeCheckoutSession)
    const { user } = await this.payments.getValidatedSessionUser(
      sessionId,
      // Stripe metadata typed as Metadata | null — no generic parameterization available
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      metadata as unknown as Record<string, string>,
    )

    return this.processDomainRegistration({
      user,
      websiteId,
      domainName,
      paymentId: paymentIntentId,
    })
  }

  /**
   * Shared domain registration logic used by both the legacy PaymentIntent flow
   * and the Checkout Session flow. Handles domain record creation/update,
   * contact info resolution, and Vercel registration.
   */
  private async processDomainRegistration({
    user,
    websiteId,
    domainName,
    paymentId,
  }: {
    user: User
    websiteId: string | number
    domainName: string
    paymentId: string | null
  }): Promise<{
    domain: Domain
    registrationResult: {
      vercelResult: GetDomainResponseBody | BuySingleDomainResponseBody | null
      projectResult: AddProjectDomainResponseBody | null
      message: string
    }
    message: string
  }> {
    const validWebsiteId = this.convertWebsiteIdToNumber(websiteId)

    const website = await this.client.website.findUniqueOrThrow({
      where: { id: validWebsiteId },
      select: {
        content: true,
        domain: true,
      },
    })

    let domain: Domain | null = website.domain || null

    if (!domain) {
      const searchResult = await this.searchForDomain(domainName)
      const domainParams = {
        websiteId: validWebsiteId,
        name: domainName,
        // Prisma Decimal | null — validateDomainSearchResult guards against null
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        price: this.validateDomainSearchResult(searchResult).price as number,
        paymentId,
        status: DomainStatus.pending,
      }
      this.logger.debug(
        { domainParams },
        `Creating new domain record for website id ${validWebsiteId}: `,
      )
      domain = await this.model.create({ data: domainParams })
    } else if (paymentId && domain.paymentId !== paymentId) {
      // Update the existing domain with the new payment ID
      // This handles cases where a previous payment failed or the domain
      // was created without a paymentId
      this.logger.debug(
        `Updating domain ${domain.id} paymentId from ${domain.paymentId} to ${paymentId}`,
      )
      domain = await this.model.update({
        where: { id: domain.id },
        data: {
          paymentId,
          status: DomainStatus.pending,
        },
      })
    }

    const contactInfo = this.buildContactInfo(user, website.content)

    try {
      const registrationResult = await this.completeDomainRegistration(
        validWebsiteId,
        contactInfo,
      )

      try {
        await this.analytics.track(
          user.id,
          EVENTS.CandidateWebsite.PurchasedDomain,
          {
            domainSelected: domainName,
            priceOfSelectedDomain: domain.price?.toNumber() ?? null,
          },
        )
      } catch (analyticsError) {
        this.logger.error(
          { analyticsError },
          `Failed to track domain purchased event for user ${user.id}`,
        )
      }

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

  async searchDomainsForCampaign(
    campaign: Campaign & { user: User },
    patterns: string[],
    maxPrice: number,
  ): Promise<PatternedDomainSearchResult> {
    const electionDateStr = campaign.details?.electionDate
    let electionDate = electionDateStr
      ? parseIsoDateAsUTC(electionDateStr)
      : new Date()
    if (!electionDateStr) {
      this.logger.warn(
        { campaignId: campaign.id, fn: 'searchDomainsForCampaign' },
        'no electionDate on campaign; falling back to current date',
      )
    } else if (isNaN(electionDate.getTime())) {
      this.logger.warn(
        {
          campaignId: campaign.id,
          electionDateStr,
          fn: 'searchDomainsForCampaign',
        },
        'invalid electionDate stored on campaign; falling back to current date',
      )
      electionDate = new Date()
    }

    let expanded: string[]
    try {
      expanded = expandDomainPatterns(
        patterns,
        {
          firstName: campaign.user.firstName ?? '',
          lastName: campaign.user.lastName ?? '',
          electionDate,
        },
        { maxCandidates: MAX_PATTERN_CANDIDATES },
      )
    } catch (error) {
      if (error instanceof PatternExpansionLimitError) {
        throw new BadRequestException(
          `Patterns expand to more than ${MAX_PATTERN_CANDIDATES} candidates`,
        )
      }
      throw error
    }

    // Per the @McpTool description on POST /domains/search, callers may pass
    // bare SLD patterns (no TLD) and the server fans them out across the
    // supported TLDs. Patterns that already include a TLD are passed through
    // unchanged so existing alternation syntax (e.g. `vote-x.(run|bio)`)
    // keeps working.
    const candidates = Array.from(
      new Set(
        expanded.flatMap((c) =>
          c.includes('.') ? [c] : SUPPORTED_TLDS.map((tld) => `${c}.${tld}`),
        ),
      ),
    )

    const checked = await Promise.allSettled(
      candidates.map((domain) =>
        this.checkPatternedCandidate(domain, maxPrice),
      ),
    )

    const found: PatternedDomainCandidate[] = []
    for (const r of checked) {
      if (r.status === 'fulfilled' && r.value !== null) {
        found.push(r.value)
      } else if (r.status === 'rejected') {
        const err =
          r.reason instanceof Error ? r.reason : new Error(String(r.reason))
        this.logger.warn(
          { err, fn: 'searchDomainsForCampaign' },
          'candidate availability check failed; skipping',
        )
      }
    }

    return { candidates: found }
  }

  private async checkPatternedCandidate(
    domain: string,
    maxPrice: number,
  ): Promise<PatternedDomainCandidate | null> {
    let availability: DomainAvailability | undefined
    try {
      const resp = await this.route53.checkDomainAvailability(domain)
      availability = resp.Availability
    } catch (error) {
      this.logger.warn(
        { err: error, domain, fn: 'checkPatternedCandidate' },
        'Route53 availability check failed; skipping candidate',
      )
      return null
    }

    if (availability !== DomainAvailability.AVAILABLE) {
      return null
    }

    let price: number
    try {
      const resp = await this.vercel.checkDomainPrice(domain)
      price = resp.price
    } catch (error) {
      this.logger.warn(
        { err: error, domain },
        'Vercel price lookup failed; skipping candidate',
      )
      return null
    }

    if (price > maxPrice) {
      return null
    }
    return { domain, price }
  }

  private async reserveDomainForCampaign(
    campaignId: number,
    domainName: string,
    price: number,
  ): Promise<
    | {
        kind: typeof DOMAIN_RESERVATION_KIND.IDEMPOTENT
        websiteSummary: Pick<
          Website,
          'id' | 'vanityPath' | 'status' | 'campaignId'
        >
        domain: Pick<Domain, 'id' | 'name' | 'status'> & {
          price: number | null
        }
      }
    | {
        kind: typeof DOMAIN_RESERVATION_KIND.CREATED
        websiteSummary: Pick<
          Website,
          'id' | 'vanityPath' | 'status' | 'campaignId'
        >
        domain: Domain
      }
  > {
    return this.client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${DOMAIN_PURCHASE_ADVISORY_LOCK_KEY}::integer, ${campaignId}::integer)`

      const website = await tx.website.findUnique({
        where: { campaignId },
        include: { domain: true },
      })

      if (!website) {
        throw new NotFoundException('No website found for this campaign')
      }

      const websiteSummary = {
        id: website.id,
        vanityPath: website.vanityPath,
        status: website.status,
        campaignId: website.campaignId,
      }

      if (website.domain) {
        if (website.domain.status !== DomainStatus.inactive) {
          if (website.domain.name === domainName) {
            return {
              kind: DOMAIN_RESERVATION_KIND.IDEMPOTENT,
              websiteSummary,
              domain: {
                id: website.domain.id,
                name: website.domain.name,
                status: website.domain.status,
                price: website.domain.price?.toNumber() ?? null,
              },
            }
          }
          throw new ConflictException(
            `A different domain (${website.domain.name}) is already in progress for this campaign`,
          )
        }

        await tx.domain.delete({ where: { id: website.domain.id } })
      }

      const created = await tx.domain.create({
        data: {
          websiteId: website.id,
          name: domainName,
          price,
          paymentId: null,
          status: DomainStatus.pending,
        },
      })

      return {
        kind: DOMAIN_RESERVATION_KIND.CREATED,
        websiteSummary,
        domain: created,
      }
    })
  }

  private async preflightDomainPurchase(
    campaignId: number,
    domainName: string,
  ): Promise<{
    website: Pick<Website, 'id' | 'vanityPath' | 'status' | 'campaignId'>
    domain: Pick<Domain, 'id' | 'name' | 'status'> & { price: number | null }
  } | null> {
    const preflight = await this.client.website.findUnique({
      where: { campaignId },
      include: { domain: true },
    })
    if (!preflight) {
      throw new NotFoundException('No website found for this campaign')
    }
    if (
      !preflight.domain ||
      preflight.domain.status === DomainStatus.inactive
    ) {
      return null
    }
    const websiteSummary = {
      id: preflight.id,
      vanityPath: preflight.vanityPath,
      status: preflight.status,
      campaignId: preflight.campaignId,
    }
    if (preflight.domain.name !== domainName) {
      throw new ConflictException(
        `A different domain (${preflight.domain.name}) is already in progress for this campaign`,
      )
    }
    return {
      website: websiteSummary,
      domain: {
        id: preflight.domain.id,
        name: preflight.domain.name,
        status: preflight.domain.status,
        price: preflight.domain.price?.toNumber() ?? null,
      },
    }
  }

  private async lookupDomainPrice(domainName: string): Promise<number> {
    try {
      const priceResp = await this.vercel.checkDomainPrice(domainName)
      return priceResp.price
    } catch (error) {
      throw new BadGatewayException(
        `Could not get price for ${domainName}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      )
    }
  }

  async purchaseDomainForCampaign(
    campaign: Campaign & { user: User },
    domainName: string,
    maxPrice: number,
  ): Promise<{
    website: Pick<Website, 'id' | 'vanityPath' | 'status' | 'campaignId'>
    domain: Pick<Domain, 'id' | 'name' | 'status'> & { price: number | null }
    alreadyExisted: boolean
    message: string
  }> {
    // The skip-payment branch below bills GP's Vercel team account; gate to
    // Pro campaigns so non-Pro browser callers can't bypass Stripe Checkout.
    // (Pro covers the bundled domain per the product design.) Strict
    // agent-only discrimination would require an actor-token claim from the
    // broker — tracked separately.
    if (!campaign.isPro) {
      throw new ForbiddenException(
        'Domain purchase requires an active Pro subscription',
      )
    }

    const preflightHit = await this.preflightDomainPurchase(
      campaign.id,
      domainName,
    )
    if (preflightHit) {
      return {
        ...preflightHit,
        alreadyExisted: true,
        message: DOMAIN_PURCHASE_IN_PROGRESS_MESSAGE,
      }
    }

    let availabilityResp: Awaited<
      ReturnType<typeof this.route53.checkDomainAvailability>
    >
    try {
      availabilityResp = await this.route53.checkDomainAvailability(domainName)
    } catch (error) {
      throw new BadGatewayException(
        `Could not check availability for ${domainName}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      )
    }
    if (availabilityResp.Availability !== DomainAvailability.AVAILABLE) {
      throw new ConflictException(`Domain ${domainName} is no longer available`)
    }

    const price = await this.lookupDomainPrice(domainName)

    if (price > maxPrice) {
      throw new ConflictException(
        `Domain ${domainName} price ${price} exceeds maxPrice ${maxPrice}`,
      )
    }

    const locked = await this.reserveDomainForCampaign(
      campaign.id,
      domainName,
      price,
    )

    if (locked.kind === DOMAIN_RESERVATION_KIND.IDEMPOTENT) {
      return {
        website: locked.websiteSummary,
        domain: locked.domain,
        alreadyExisted: true,
        message: DOMAIN_PURCHASE_IN_PROGRESS_MESSAGE,
      }
    }

    const { websiteSummary, domain: createdDomain } = locked

    // Agent purchases handle registration inline (no Stripe charge — domain
    // billed to GP's Vercel team account; the maxPrice check above is the
    // safety bound). Browser purchases flow through handleDomainPostPurchase,
    // which sets paymentId so completeDomainRegistration's default guard fires.
    try {
      const website = await this.client.website.findUniqueOrThrow({
        where: { id: websiteSummary.id },
        select: { content: true },
      })
      const contactInfo = this.buildContactInfo(campaign.user, website.content)
      await this.completeDomainRegistration(websiteSummary.id, contactInfo, {
        skipPaymentVerification: true,
      })
    } catch (error) {
      // Mark inactive so preflight on retry falls through to a fresh reservation
      // instead of returning alreadyExisted: true for a stuck pending row.
      // completeDomainRegistration's Vercel-failure path sets this itself, but
      // other failure modes (the website lookup above, top-level
      // findUniqueOrThrow, !domain.price, getDomainDetails rethrow, final
      // status update) do not — this is the safety net for those.
      await this.model.update({
        where: { id: createdDomain.id },
        data: { status: DomainStatus.inactive },
      })
      throw error
    }

    // completeDomainRegistration unconditionally sets status=submitted; reuse
    // the reservation row's fields rather than re-reading from the DB.
    return {
      website: websiteSummary,
      domain: {
        id: createdDomain.id,
        name: createdDomain.name,
        status: DomainStatus.submitted,
        price: createdDomain.price?.toNumber() ?? null,
      },
      alreadyExisted: false,
      message: 'Domain registration submitted',
    }
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
      this.logger.warn(
        { error },
        `Could not get Vercel price for ${domainName}:`,
      )
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
            { error },
            `Could not get Vercel price for ${suggestion.DomainName}:`,
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

  async setupDomainEmailForwarding(domain: Domain) {
    const forwardingEmailAddress = GP_CAMPAIGN_DOMAIN_FORWARD_ADDRESS
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
        this.logger.error(e, 'Error adding domain to forward email service:')
        throw new Error('Error adding domain to forward email service:', {
          cause: e,
        })
      }
    }
    if (!forwardEmailDomain) {
      try {
        forwardEmailDomain = await this.forwardEmailService.addDomain(domain)
      } catch (e) {
        this.logger.error(
          { e },
          'Error adding domain to forward email service:',
        )
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
      this.logger.error({ e }, 'Error listing DNS records for domain:')
    }

    try {
      const mxRecords = dnsRecords.filter(
        (r: Records) =>
          // Vercel SDK types r.type as string — enum comparison is safe since values match
          // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
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
      this.logger.error({ e }, 'Error creating DNS MX records for domain:')
      throw new Error('Error creating DNS MX records for domain:', { cause: e })
    }
    this.logger.debug(`MX records created for domain ${domain.name}`)

    try {
      const txtVerificationRecord = dnsRecords.find(
        (r: Records) =>
          // Vercel SDK types r.type as string — enum comparison is safe since values match
          // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
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
      this.logger.error(
        { e },
        'Error creating TXT verification record for domain:',
      )
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
        { e },
        `catch-all alias not created for domain *@${domain.name} -> ${forwardingEmailAddress} :`,
      )
      throw new Error(
        `catch-all alias not created for domain *@${domain.name} -> ${forwardingEmailAddress} :`,
        { cause: e },
      )
    }

    try {
      await this.persistCampaignEmail(domain)
    } catch (e) {
      this.logger.error(
        { e },
        `Failed to persist campaign email for domain ${domain.name}`,
      )
    }

    return forwardEmailDomain
  }

  private async persistCampaignEmail(domain: Domain) {
    await this.client.$transaction(async (tx) => {
      const website = await tx.website.findUnique({
        where: { id: domain.websiteId },
        select: { content: true, campaignId: true },
      })
      if (!website) return

      const campaignEmail = `info@${domain.name}`
      const content = website.content ?? {}

      await tx.website.update({
        where: { id: domain.websiteId },
        data: {
          content: {
            ...content,
            contact: {
              ...(content.contact ?? {}),
              email: campaignEmail,
            },
          },
        },
      })

      await tx.campaign.update({
        where: { id: website.campaignId },
        data: { campaignEmail },
      })
    })
  }

  // called after payment is accepted, send registration request to Vercel
  // TODO: This should be attempted BEFORE payment is taken. If this fails for some reason,
  //  we've already taken the customer's $$ and not would need a mechanism to refund
  //  them.  This is backwards
  async completeDomainRegistration(
    websiteId: number,
    contact: RegisterDomainSchema,
    options: { skipPaymentVerification?: boolean } = {},
  ) {
    const domain = await this.findUniqueOrThrow({
      where: { websiteId },
    })

    if (!options.skipPaymentVerification) {
      if (!domain.paymentId) {
        throw new BadRequestException({
          message: 'No payment ID found for domain',
          errorCode: 'BILLING_DOMAIN_PAYMENT_ID_MISSING',
        })
      }

      const paymentIntent = await this.payments.retrievePayment(
        domain.paymentId,
      )

      // Stripe SDK uses broad union types — cannot narrow without runtime expandable-field check
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      if ((paymentIntent.status as PaymentStatus) !== PaymentStatus.SUCCEEDED) {
        throw new BadRequestException(
          `Payment not completed. Current status: ${paymentIntent.status}`,
        )
      }
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
        this.logger.error({ error }, 'Error registering domain with Vercel:')

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
        forwardEmailDomain = await this.setupDomainEmailForwarding(domain)
        this.logger.debug(`Email forwarding set up for domain *@${domain.name}`)
      } catch (e) {
        this.logger.error(
          `Error setting up email forwarding for domain *@${domain.name} : ${e instanceof Error ? e.message : 'error unknown while attempting to setup email forwarding'}`,
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
      this.logger.debug(verifyResult, 'Domain verification result:')
    } catch (error) {
      this.logger.error({ error }, 'Error configuring domain:')
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

  async submitRegistrantVerification(
    domainName: string,
    verificationUrl: string,
  ) {
    const normalized = domainName.toLowerCase()
    const domain = await this.model.findUnique({
      where: { name: normalized },
    })
    if (!domain) {
      throw new NotFoundException(
        `No managed domain found matching ${normalized}`,
      )
    }

    if (domain.registrantVerifiedAt) {
      return {
        domain: domain.name,
        alreadyVerified: true,
        registrantVerifiedAt: domain.registrantVerifiedAt,
      }
    }

    try {
      await this.vercel.submitDomainRegistrantVerification(verificationUrl)
    } catch {
      throw new BadGatewayException(
        `Failed to submit registrant verification for ${normalized}`,
      )
    }

    let confirmedVerified: boolean
    try {
      const detail = await this.vercel.getDomainDetails(domain.name)
      confirmedVerified = detail.domain.verified === true
    } catch (error) {
      throw new BadGatewayException(
        `Submitted verification URL for ${domain.name} but failed to confirm Vercel domain state: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      )
    }

    if (!confirmedVerified) {
      throw new BadGatewayException(
        `Submitted verification URL for ${domain.name} but Vercel still reports the domain as unverified; retry expected via webhook redelivery.`,
      )
    }

    const { count } = await this.model.updateMany({
      where: { id: domain.id, registrantVerifiedAt: null },
      data: { registrantVerifiedAt: new Date() },
    })

    if (count === 0) {
      const current = await this.model.findUniqueOrThrow({
        where: { id: domain.id },
      })
      return {
        domain: current.name,
        alreadyVerified: true,
        registrantVerifiedAt: current.registrantVerifiedAt,
      }
    }

    const stamped = await this.model.findUniqueOrThrow({
      where: { id: domain.id },
    })

    return {
      domain: stamped.name,
      alreadyVerified: false,
      registrantVerifiedAt: stamped.registrantVerifiedAt,
    }
  }

  async getPaymentStatus(paymentId: string): Promise<PaymentStatus | null> {
    try {
      const paymentIntent = await this.payments.retrievePayment(paymentId)
      // Stripe SDK uses broad union types — cannot narrow without runtime expandable-field check
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      return paymentIntent.status as PaymentStatus
    } catch (error) {
      this.logger.warn(
        { error },
        `Failed to retrieve payment status for ${paymentId}:`,
      )

      // Handle different error types appropriately
      if (error instanceof Error) {
        const errorMessage = error.message.toLowerCase()

        if (
          errorMessage.includes('no such payment_intent') ||
          errorMessage.includes('not found') ||
          // Stripe errors have a code property not in the base Error type

          (error as Error & { code?: string }).code === 'resource_missing'
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
          // Stripe errors have a code property not in the base Error type

          (error as Error & { code?: string }).code === 'api_connection_error'
        ) {
          throw new BadGatewayException(
            `Stripe service unavailable: ${error.message}`,
          )
        }

        // Invalid payment ID format
        if (
          errorMessage.includes('invalid') ||
          // Stripe errors have a code property not in the base Error type

          (error as Error & { code?: string }).code === 'invalid_request_error'
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
