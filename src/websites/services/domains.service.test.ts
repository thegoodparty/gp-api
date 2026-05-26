import { Test, TestingModule } from '@nestjs/testing'
import { Domain, DomainStatus, WebsiteStatus } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'
import { AnalyticsService } from 'src/analytics/analytics.service'
import { PrismaService } from 'src/prisma/prisma.service'
import { PaymentsService } from 'src/payments/services/payments.service'
import { AwsRoute53Service } from 'src/vendors/aws/services/awsRoute53.service'
import { StripeService } from 'src/vendors/stripe/services/stripe.service'
import { VercelService } from 'src/vendors/vercel/services/vercel.service'
import { ForwardEmailService } from 'src/vendors/forwardEmail/services/forwardEmail.service'
import { QueueProducerService } from 'src/queue/producer/queueProducer.service'
import { EVENTS } from 'src/vendors/segment/segment.types'
import { PinoLogger } from 'nestjs-pino'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DomainsService } from './domains.service'
import { RegisterDomainSchema } from '../schemas/RegisterDomain.schema'
import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import { MessageGroup, QueueType } from 'src/queue/queue.types'
import {
  createMockCampaign,
  createMockUser,
} from '@/shared/test-utils/mockData.util'
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common'
import { DomainAvailability } from '@aws-sdk/client-route-53-domains'

const mockUser = createMockUser()

const mockDomain: Domain = {
  id: 1,
  name: 'test-domain.com',
  websiteId: 10,
  price: new Decimal(11.25),
  paymentId: 'pi_123',
  status: DomainStatus.pending,
  operationId: null,
  emailForwardingDomainId: null,
  registrantVerifiedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('DomainsService', () => {
  let service: DomainsService
  let mockAnalytics: { track: ReturnType<typeof vi.fn> }
  let mockStripe: { retrieveCheckoutSession: ReturnType<typeof vi.fn> }
  let mockPayments: {
    getValidatedSessionUser: ReturnType<typeof vi.fn>
    retrievePayment: ReturnType<typeof vi.fn>
  }
  let mockRoute53: {
    checkDomainAvailability: ReturnType<typeof vi.fn>
    getDomainSuggestions: ReturnType<typeof vi.fn>
  }
  let mockVercel: {
    checkDomainPrice: ReturnType<typeof vi.fn>
    listDnsRecords: ReturnType<typeof vi.fn>
    createMXRecords: ReturnType<typeof vi.fn>
    createTXTVerificationRecord: ReturnType<typeof vi.fn>
    submitDomainRegistrantVerification: ReturnType<typeof vi.fn>
    getDomainDetails: ReturnType<typeof vi.fn>
  }
  let mockForwardEmail: {
    getDomain: ReturnType<typeof vi.fn>
    addDomain: ReturnType<typeof vi.fn>
    getCatchAllDomainAliases: ReturnType<typeof vi.fn>
    createCatchAllAlias: ReturnType<typeof vi.fn>
    updateDomainAlias: ReturnType<typeof vi.fn>
  }
  let mockQueue: { sendMessage: ReturnType<typeof vi.fn> }
  let mockPrisma: {
    domain: {
      findMany: ReturnType<typeof vi.fn>
      update: ReturnType<typeof vi.fn>
      updateMany: ReturnType<typeof vi.fn>
      create: ReturnType<typeof vi.fn>
      delete: ReturnType<typeof vi.fn>
      findUnique: ReturnType<typeof vi.fn>
      findUniqueOrThrow: ReturnType<typeof vi.fn>
    }
    website: {
      findUniqueOrThrow: ReturnType<typeof vi.fn>
      findUnique: ReturnType<typeof vi.fn>
      update: ReturnType<typeof vi.fn>
    }
    campaign: {
      update: ReturnType<typeof vi.fn>
    }
    $transaction: ReturnType<typeof vi.fn>
    $executeRaw: ReturnType<typeof vi.fn>
  }

  beforeEach(async () => {
    mockRoute53 = {
      checkDomainAvailability: vi.fn(),
      getDomainSuggestions: vi.fn().mockResolvedValue({ SuggestionsList: [] }),
    }
    mockVercel = {
      checkDomainPrice: vi.fn(),
      listDnsRecords: vi.fn().mockResolvedValue([]),
      createMXRecords: vi.fn().mockResolvedValue(undefined),
      createTXTVerificationRecord: vi.fn().mockResolvedValue(undefined),
      submitDomainRegistrantVerification: vi
        .fn()
        .mockResolvedValue({ status: HttpStatus.OK }),
      getDomainDetails: vi.fn().mockResolvedValue({
        domain: { verified: true, name: 'test-domain.com' },
      }),
    }
    mockForwardEmail = {
      getDomain: vi.fn().mockResolvedValue(null),
      addDomain: vi.fn().mockResolvedValue({
        id: 'fed_1',
        verification_record: 'vr',
        name: mockDomain.name,
      }),
      getCatchAllDomainAliases: vi.fn().mockResolvedValue([]),
      createCatchAllAlias: vi.fn().mockResolvedValue({ id: 'alias_1' }),
      updateDomainAlias: vi.fn().mockResolvedValue({ id: 'alias_1' }),
    }
    mockQueue = { sendMessage: vi.fn().mockResolvedValue(undefined) }
    mockAnalytics = {
      track: vi.fn().mockResolvedValue(undefined),
    }

    mockStripe = {
      retrieveCheckoutSession: vi.fn().mockResolvedValue({
        payment_intent: 'pi_123',
      }),
    }

    mockPayments = {
      getValidatedSessionUser: vi.fn().mockResolvedValue({ user: mockUser }),
      retrievePayment: vi.fn().mockResolvedValue({ status: 'succeeded' }),
    }

    mockPrisma = {
      domain: {
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn().mockResolvedValue(mockDomain),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi.fn().mockResolvedValue(mockDomain),
        delete: vi.fn().mockResolvedValue(mockDomain),
        findUnique: vi.fn().mockResolvedValue(mockDomain),
        findUniqueOrThrow: vi.fn().mockResolvedValue(mockDomain),
      },
      website: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          content: { contact: {} },
          domain: mockDomain,
        }),
        findUnique: vi.fn().mockResolvedValue(null),
        update: vi.fn().mockResolvedValue(undefined),
      },
      campaign: {
        update: vi.fn().mockResolvedValue(undefined),
      },
      $executeRaw: vi.fn().mockResolvedValue(0),
      $transaction: vi.fn(
        async <R>(
          callback: (tx: typeof mockPrisma) => Promise<R>,
        ): Promise<R> => callback(mockPrisma),
      ),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AwsRoute53Service, useValue: mockRoute53 },
        { provide: VercelService, useValue: mockVercel },
        { provide: PaymentsService, useValue: mockPayments },
        { provide: StripeService, useValue: mockStripe },
        { provide: ForwardEmailService, useValue: mockForwardEmail },
        { provide: QueueProducerService, useValue: mockQueue },
        { provide: AnalyticsService, useValue: mockAnalytics },
        { provide: PinoLogger, useValue: createMockLogger() },
        DomainsService,
      ],
    }).compile()

    service = module.get<DomainsService>(DomainsService)

    vi.clearAllMocks()
  })

  describe('handleDomainPostPurchase - Segment event tracking', () => {
    const sessionId = 'cs_test_123'
    const metadata = {
      domainName: 'test-domain.com',
      websiteId: 10,
      userId: '7',
    }

    it('should track PurchasedDomain event after successful domain registration', async () => {
      vi.spyOn(service, 'completeDomainRegistration').mockResolvedValue({
        vercelResult: null,
        projectResult: null,
        message: 'Disabled',
      })

      await service.handleDomainPostPurchase(sessionId, metadata)

      expect(mockAnalytics.track).toHaveBeenCalledWith(
        mockUser.id,
        EVENTS.CandidateWebsite.PurchasedDomain,
        {
          domainSelected: 'test-domain.com',
          priceOfSelectedDomain: 11.25,
        },
      )
    })

    it('should not track event when domain registration fails', async () => {
      vi.spyOn(service, 'completeDomainRegistration').mockRejectedValue(
        new Error('Vercel registration failed'),
      )

      await expect(
        service.handleDomainPostPurchase(sessionId, metadata),
      ).rejects.toThrow('Failed to register domain with Vercel')

      expect(mockAnalytics.track).not.toHaveBeenCalled()
      expect(mockPrisma.domain.update).toHaveBeenCalledWith({
        where: { id: mockDomain.id },
        data: { status: DomainStatus.inactive },
      })
    })

    it('should send null priceOfSelectedDomain when domain has no price', async () => {
      mockPrisma.website.findUniqueOrThrow.mockResolvedValue({
        content: { contact: {} },
        domain: { ...mockDomain, price: null },
      })

      vi.spyOn(service, 'completeDomainRegistration').mockResolvedValue({
        vercelResult: null,
        projectResult: null,
        message: 'Disabled',
      })

      await service.handleDomainPostPurchase(sessionId, metadata)

      expect(mockAnalytics.track).toHaveBeenCalledWith(
        mockUser.id,
        EVENTS.CandidateWebsite.PurchasedDomain,
        {
          domainSelected: 'test-domain.com',
          priceOfSelectedDomain: null,
        },
      )
    })

    it('should still return the result when analytics tracking fails', async () => {
      vi.spyOn(service, 'completeDomainRegistration').mockResolvedValue({
        vercelResult: null,
        projectResult: null,
        message: 'Disabled',
      })
      mockAnalytics.track.mockRejectedValue(new Error('Segment unavailable'))

      const result = await service.handleDomainPostPurchase(sessionId, metadata)

      expect(result).toHaveProperty('domain')
      expect(result).toHaveProperty('message')
    })
  })

  describe('searchDomainsForCampaign', () => {
    const campaignWithUser = {
      ...createMockCampaign({
        details: { electionDate: '2026-11-03' },
      }),
      user: createMockUser({ firstName: 'Mary', lastName: "O'Neill" }),
    }

    it('expands patterns, queries registrar, returns available + under cap', async () => {
      mockRoute53.checkDomainAvailability.mockImplementation(
        (domain: string) => ({
          Availability:
            domain === 'vote-oneill-nov-2026.bio'
              ? DomainAvailability.UNAVAILABLE
              : DomainAvailability.AVAILABLE,
        }),
      )
      mockVercel.checkDomainPrice.mockImplementation((domain: string) => ({
        price: domain === 'vote-oneill-nov-2026.win' ? 25 : 8,
      }))

      const result = await service.searchDomainsForCampaign(
        campaignWithUser,
        ['vote-{last_name}-{month_abbreviation}-{yyyy}.(run|bio|win)'],
        10,
      )

      expect(result.candidates.map((c) => c.domain).sort()).toEqual(
        ['vote-oneill-nov-2026.run'].sort(),
      )
      expect(result.candidates[0]).toEqual({
        domain: 'vote-oneill-nov-2026.run',
        price: 8,
      })
    })

    it('normalizes the candidate last name (handles apostrophes)', async () => {
      mockRoute53.checkDomainAvailability.mockResolvedValue({
        Availability: DomainAvailability.AVAILABLE,
      })
      mockVercel.checkDomainPrice.mockResolvedValue({ price: 5 })

      const result = await service.searchDomainsForCampaign(
        campaignWithUser,
        ['vote-{last_name}.run'],
        10,
      )

      expect(mockRoute53.checkDomainAvailability).toHaveBeenCalledWith(
        'vote-oneill.run',
      )
      expect(result.candidates).toHaveLength(1)
    })

    it('deduplicates identical expansions across patterns', async () => {
      mockRoute53.checkDomainAvailability.mockResolvedValue({
        Availability: DomainAvailability.AVAILABLE,
      })
      mockVercel.checkDomainPrice.mockResolvedValue({ price: 5 })

      await service.searchDomainsForCampaign(
        campaignWithUser,
        ['vote-{last_name}.run', 'vote-{last_name}.(run|bio)'],
        10,
      )

      expect(mockRoute53.checkDomainAvailability).toHaveBeenCalledTimes(2)
    })

    it('excludes domains over the price cap', async () => {
      mockRoute53.checkDomainAvailability.mockResolvedValue({
        Availability: DomainAvailability.AVAILABLE,
      })
      mockVercel.checkDomainPrice.mockImplementation((domain: string) => ({
        price: domain.endsWith('.bio') ? 50 : 7,
      }))

      const result = await service.searchDomainsForCampaign(
        campaignWithUser,
        ['vote-{last_name}.(run|bio)'],
        10,
      )

      expect(result.candidates.map((c) => c.domain)).toEqual([
        'vote-oneill.run',
      ])
    })

    it('returns empty list when no candidates expanded', async () => {
      const result = await service.searchDomainsForCampaign(
        campaignWithUser,
        [],
        10,
      )

      expect(result.candidates).toEqual([])
      expect(mockRoute53.checkDomainAvailability).not.toHaveBeenCalled()
    })

    it('uses UTC-anchored date components for boundary date-only strings', async () => {
      // Jan 1 is the worst case: a TZ-naive parser would render local
      // 2026-01-01 as Dec 31, 2025 in UTC, producing 'dec-2025' instead
      // of 'jan-2026'. This test fails on any TZ-east-of-UTC server
      // unless the parser anchors to UTC midnight.
      const campaignBoundary = {
        ...createMockCampaign({ details: { electionDate: '2026-01-01' } }),
        user: createMockUser({ firstName: 'Mary', lastName: "O'Neill" }),
      }
      mockRoute53.checkDomainAvailability.mockResolvedValue({
        Availability: DomainAvailability.AVAILABLE,
      })
      mockVercel.checkDomainPrice.mockResolvedValue({ price: 5 })

      const result = await service.searchDomainsForCampaign(
        campaignBoundary,
        ['vote-{last_name}-{month_abbreviation}-{yyyy}.run'],
        10,
      )

      expect(result.candidates.map((c) => c.domain)).toEqual([
        'vote-oneill-jan-2026.run',
      ])
    })

    it('falls back to current date when campaign has no electionDate', async () => {
      const campaignNoDate = {
        ...createMockCampaign({ details: {} }),
        user: createMockUser({ firstName: 'Mary', lastName: "O'Neill" }),
      }
      mockRoute53.checkDomainAvailability.mockResolvedValue({
        Availability: DomainAvailability.AVAILABLE,
      })
      mockVercel.checkDomainPrice.mockResolvedValue({ price: 5 })

      const result = await service.searchDomainsForCampaign(
        campaignNoDate,
        ['vote-{last_name}-{yyyy}.run'],
        10,
      )

      expect(result.candidates).toHaveLength(1)
      expect(result.candidates[0].domain).toMatch(/^vote-oneill-\d{4}\.run$/)
    })

    it('skips (does not fail the whole request) when one availability call fails', async () => {
      mockRoute53.checkDomainAvailability.mockImplementation(
        (domain: string) => {
          if (domain.endsWith('.bio')) {
            throw new Error('route53 boom')
          }
          return { Availability: DomainAvailability.AVAILABLE }
        },
      )
      mockVercel.checkDomainPrice.mockResolvedValue({ price: 5 })

      const result = await service.searchDomainsForCampaign(
        campaignWithUser,
        ['vote-{last_name}.(run|bio)'],
        10,
      )

      expect(result.candidates.map((c) => c.domain)).toEqual([
        'vote-oneill.run',
      ])
    })

    it('skips a candidate whose price lookup fails (does not fail the whole request)', async () => {
      mockRoute53.checkDomainAvailability.mockResolvedValue({
        Availability: DomainAvailability.AVAILABLE,
      })
      mockVercel.checkDomainPrice.mockImplementation((domain: string) => {
        if (domain.endsWith('.bio')) throw new Error('vercel boom')
        return { price: 7 }
      })

      const result = await service.searchDomainsForCampaign(
        campaignWithUser,
        ['vote-{last_name}.(run|bio)'],
        10,
      )

      expect(result.candidates.map((c) => c.domain)).toEqual([
        'vote-oneill.run',
      ])
    })

    it('rejects with BadRequest when patterns expand past the candidate cap', async () => {
      const huge =
        '(a|b|c|d|e|f|g|h|i|j)(a|b|c|d|e|f|g|h|i|j){last_name}.(run|bio)'

      await expect(
        service.searchDomainsForCampaign(campaignWithUser, [huge], 10),
      ).rejects.toBeInstanceOf(BadRequestException)
      expect(mockRoute53.checkDomainAvailability).not.toHaveBeenCalled()
    })

    it('skips candidate when Route53 throws BadRequest (e.g. UnsupportedTLD)', async () => {
      mockRoute53.checkDomainAvailability.mockImplementation(() => {
        throw new BadRequestException('UnsupportedTLD')
      })
      mockVercel.checkDomainPrice.mockResolvedValue({ price: 5 })

      const result = await service.searchDomainsForCampaign(
        campaignWithUser,
        ['vote-{last_name}.xyz'],
        10,
      )

      expect(result).toEqual({ candidates: [] })
    })
  })

  describe('purchaseDomainForCampaign', () => {
    const campaign = createMockCampaign({ id: 42, isPro: true })
    const campaignWithUser = { ...campaign, user: mockUser }
    const domainName = 'vote-oneill.run'
    const maxPrice = 50

    const baseWebsite = {
      id: 10,
      vanityPath: 'test-slug',
      status: WebsiteStatus.unpublished,
      campaignId: 42,
      content: { contact: {} },
      domain: null as Domain | null,
    }

    it('throws NotFoundException when no website exists for the campaign', async () => {
      mockPrisma.website.findUnique.mockResolvedValue(null)

      await expect(
        service.purchaseDomainForCampaign(
          campaignWithUser,
          domainName,
          maxPrice,
        ),
      ).rejects.toBeInstanceOf(NotFoundException)

      expect(mockRoute53.checkDomainAvailability).not.toHaveBeenCalled()
    })

    it('throws ForbiddenException when the campaign is not Pro', async () => {
      const nonProCampaign = {
        ...createMockCampaign({ id: 42, isPro: false }),
        user: mockUser,
      }

      await expect(
        service.purchaseDomainForCampaign(nonProCampaign, domainName, maxPrice),
      ).rejects.toBeInstanceOf(ForbiddenException)

      expect(mockPrisma.website.findUnique).not.toHaveBeenCalled()
      expect(mockRoute53.checkDomainAvailability).not.toHaveBeenCalled()
    })

    it.each([
      DomainStatus.pending,
      DomainStatus.submitted,
      DomainStatus.registered,
      DomainStatus.active,
    ])(
      'returns existing record without re-purchasing when same-name domain is %s',
      async (status) => {
        mockPrisma.website.findUnique.mockResolvedValue({
          ...baseWebsite,
          domain: { ...mockDomain, status },
        })

        const result = await service.purchaseDomainForCampaign(
          campaignWithUser,
          mockDomain.name,
          maxPrice,
        )

        expect(result.alreadyExisted).toBe(true)
        expect(result.domain.status).toBe(status)
        expect(result.domain.name).toBe(mockDomain.name)
        expect(result.website.campaignId).toBe(campaign.id)
        expect(mockRoute53.checkDomainAvailability).not.toHaveBeenCalled()
        expect(mockPrisma.domain.create).not.toHaveBeenCalled()
        expect(mockPrisma.domain.delete).not.toHaveBeenCalled()
      },
    )

    it.each([
      DomainStatus.pending,
      DomainStatus.submitted,
      DomainStatus.registered,
      DomainStatus.active,
    ])(
      'throws ConflictException when a DIFFERENT domain is %s for the campaign',
      async (status) => {
        mockPrisma.website.findUnique.mockResolvedValue({
          ...baseWebsite,
          domain: {
            ...mockDomain,
            name: 'already-pending.com',
            status,
          },
        })

        await expect(
          service.purchaseDomainForCampaign(
            campaignWithUser,
            domainName,
            maxPrice,
          ),
        ).rejects.toBeInstanceOf(ConflictException)

        expect(mockRoute53.checkDomainAvailability).not.toHaveBeenCalled()
        expect(mockPrisma.domain.create).not.toHaveBeenCalled()
        expect(mockPrisma.domain.delete).not.toHaveBeenCalled()
      },
    )

    it('takes the per-campaign advisory lock during the reservation transaction', async () => {
      mockPrisma.website.findUnique.mockResolvedValue(baseWebsite)
      mockPrisma.website.findUniqueOrThrow.mockResolvedValue({
        content: { contact: {} },
      })
      mockRoute53.checkDomainAvailability.mockResolvedValue({
        Availability: DomainAvailability.AVAILABLE,
      })
      mockVercel.checkDomainPrice.mockResolvedValue({ price: 12 })
      mockPrisma.domain.create.mockResolvedValue({
        ...mockDomain,
        name: domainName,
        paymentId: null,
        price: new Decimal(12),
      })
      mockPrisma.domain.findUniqueOrThrow.mockResolvedValue({
        ...mockDomain,
        name: domainName,
        paymentId: null,
        price: new Decimal(12),
        status: DomainStatus.submitted,
      })
      vi.spyOn(service, 'completeDomainRegistration').mockResolvedValue({
        vercelResult: null,
        projectResult: null,
        message: 'Disabled',
      })

      await service.purchaseDomainForCampaign(
        campaignWithUser,
        domainName,
        maxPrice,
      )

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1)
      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1)
      const lockArgs = mockPrisma.$executeRaw.mock.calls[0]
      expect(lockArgs[0].join('?')).toContain('pg_advisory_xact_lock')
      expect(lockArgs).toContain(campaign.id)
    })

    it('does NOT hold the advisory lock during external HTTP calls', async () => {
      mockPrisma.website.findUnique.mockResolvedValue(baseWebsite)
      mockPrisma.website.findUniqueOrThrow.mockResolvedValue({
        content: { contact: {} },
      })
      mockRoute53.checkDomainAvailability.mockResolvedValue({
        Availability: DomainAvailability.AVAILABLE,
      })
      mockVercel.checkDomainPrice.mockResolvedValue({ price: 12 })
      mockPrisma.domain.create.mockResolvedValue({
        ...mockDomain,
        name: domainName,
        paymentId: null,
        price: new Decimal(12),
      })
      mockPrisma.domain.findUniqueOrThrow.mockResolvedValue({
        ...mockDomain,
        name: domainName,
        paymentId: null,
        price: new Decimal(12),
        status: DomainStatus.submitted,
      })
      vi.spyOn(service, 'completeDomainRegistration').mockResolvedValue({
        vercelResult: null,
        projectResult: null,
        message: 'Disabled',
      })

      await service.purchaseDomainForCampaign(
        campaignWithUser,
        domainName,
        maxPrice,
      )

      const route53Order =
        mockRoute53.checkDomainAvailability.mock.invocationCallOrder[0]
      const vercelPriceOrder =
        mockVercel.checkDomainPrice.mock.invocationCallOrder[0]
      const txOrder = mockPrisma.$transaction.mock.invocationCallOrder[0]
      expect(route53Order).toBeLessThan(txOrder)
      expect(vercelPriceOrder).toBeLessThan(txOrder)
    })

    it('deletes the inactive Domain row before creating a fresh one with the new name', async () => {
      const stale = {
        ...mockDomain,
        id: 99,
        name: 'old-stale-domain.com',
        status: DomainStatus.inactive,
      }
      mockPrisma.website.findUnique.mockResolvedValue({
        ...baseWebsite,
        domain: stale,
      })
      mockRoute53.checkDomainAvailability.mockResolvedValue({
        Availability: DomainAvailability.AVAILABLE,
      })
      mockVercel.checkDomainPrice.mockResolvedValue({ price: 12 })
      mockPrisma.domain.create.mockResolvedValue({
        ...mockDomain,
        id: 100,
        name: domainName,
        paymentId: null,
        price: new Decimal(12),
      })
      mockPrisma.domain.findUniqueOrThrow.mockResolvedValue({
        ...mockDomain,
        id: 100,
        name: domainName,
        paymentId: null,
        price: new Decimal(12),
        status: DomainStatus.submitted,
      })
      mockPrisma.website.findUniqueOrThrow.mockResolvedValue({
        content: { contact: {} },
      })
      vi.spyOn(service, 'completeDomainRegistration').mockResolvedValue({
        vercelResult: null,
        projectResult: null,
        message: 'Disabled',
      })

      const result = await service.purchaseDomainForCampaign(
        campaignWithUser,
        domainName,
        maxPrice,
      )

      expect(mockPrisma.domain.delete).toHaveBeenCalledWith({
        where: { id: stale.id },
      })
      const deleteOrder = mockPrisma.domain.delete.mock.invocationCallOrder[0]
      const createOrder = mockPrisma.domain.create.mock.invocationCallOrder[0]
      expect(deleteOrder).toBeLessThan(createOrder)

      expect(mockPrisma.domain.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: domainName,
          websiteId: baseWebsite.id,
          paymentId: null,
          status: DomainStatus.pending,
        }),
      })
      expect(result.alreadyExisted).toBe(false)
      expect(result.domain.name).toBe(domainName)
    })

    it('throws ConflictException when the domain is no longer available', async () => {
      mockPrisma.website.findUnique.mockResolvedValue(baseWebsite)
      mockRoute53.checkDomainAvailability.mockResolvedValue({
        Availability: DomainAvailability.UNAVAILABLE,
      })

      await expect(
        service.purchaseDomainForCampaign(
          campaignWithUser,
          domainName,
          maxPrice,
        ),
      ).rejects.toBeInstanceOf(ConflictException)

      expect(mockPrisma.domain.create).not.toHaveBeenCalled()
    })

    it('does NOT call getDomainSuggestions on the purchase path', async () => {
      mockPrisma.website.findUnique.mockResolvedValue(baseWebsite)
      mockRoute53.checkDomainAvailability.mockResolvedValue({
        Availability: DomainAvailability.UNAVAILABLE,
      })

      await expect(
        service.purchaseDomainForCampaign(
          campaignWithUser,
          domainName,
          maxPrice,
        ),
      ).rejects.toBeInstanceOf(ConflictException)

      expect(mockRoute53.getDomainSuggestions).not.toHaveBeenCalled()
    })

    it('creates a Domain row with paymentId=null and returns post-registration status on the happy path', async () => {
      mockPrisma.website.findUnique.mockResolvedValue(baseWebsite)
      mockPrisma.website.findUniqueOrThrow.mockResolvedValue({
        content: { contact: {} },
      })
      mockRoute53.checkDomainAvailability.mockResolvedValue({
        Availability: DomainAvailability.AVAILABLE,
      })
      mockVercel.checkDomainPrice.mockResolvedValue({ price: 12 })
      const created = {
        ...mockDomain,
        name: domainName,
        paymentId: null,
        price: new Decimal(12),
      }
      mockPrisma.domain.create.mockResolvedValue(created)
      mockPrisma.domain.findUniqueOrThrow.mockResolvedValue({
        ...created,
        status: DomainStatus.submitted,
      })
      vi.spyOn(service, 'completeDomainRegistration').mockResolvedValue({
        vercelResult: null,
        projectResult: null,
        message: 'Disabled',
      })

      const result = await service.purchaseDomainForCampaign(
        campaignWithUser,
        domainName,
        maxPrice,
      )

      expect(result.alreadyExisted).toBe(false)
      expect(result.domain.name).toBe(domainName)
      expect(result.domain.status).toBe(DomainStatus.submitted)
      expect(result.website.campaignId).toBe(campaign.id)
      expect(mockPrisma.domain.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: domainName,
          websiteId: baseWebsite.id,
          paymentId: null,
          status: DomainStatus.pending,
        }),
      })
    })

    it('invokes completeDomainRegistration with skipPaymentVerification after reservation', async () => {
      mockPrisma.website.findUnique.mockResolvedValue(baseWebsite)
      mockPrisma.website.findUniqueOrThrow.mockResolvedValue({
        content: { contact: {} },
      })
      mockRoute53.checkDomainAvailability.mockResolvedValue({
        Availability: DomainAvailability.AVAILABLE,
      })
      mockVercel.checkDomainPrice.mockResolvedValue({ price: 12 })
      const created = {
        ...mockDomain,
        name: domainName,
        paymentId: null,
        price: new Decimal(12),
      }
      mockPrisma.domain.create.mockResolvedValue(created)
      mockPrisma.domain.findUniqueOrThrow.mockResolvedValue({
        ...created,
        status: DomainStatus.submitted,
      })
      const completeSpy = vi
        .spyOn(service, 'completeDomainRegistration')
        .mockResolvedValue({
          vercelResult: null,
          projectResult: null,
          message: 'Disabled',
        })

      await service.purchaseDomainForCampaign(
        campaignWithUser,
        domainName,
        maxPrice,
      )

      expect(completeSpy).toHaveBeenCalledTimes(1)
      const [websiteIdArg, , optionsArg] = completeSpy.mock.calls[0]
      expect(websiteIdArg).toBe(baseWebsite.id)
      expect(optionsArg).toEqual({ skipPaymentVerification: true })
      const completeOrder = completeSpy.mock.invocationCallOrder[0]
      const createOrder = mockPrisma.domain.create.mock.invocationCallOrder[0]
      expect(completeOrder).toBeGreaterThan(createOrder)
    })

    it('throws ConflictException when looked-up price exceeds maxPrice; no Domain row created', async () => {
      mockPrisma.website.findUnique.mockResolvedValue(baseWebsite)
      mockRoute53.checkDomainAvailability.mockResolvedValue({
        Availability: DomainAvailability.AVAILABLE,
      })
      mockVercel.checkDomainPrice.mockResolvedValue({ price: 75 })
      const completeSpy = vi.spyOn(service, 'completeDomainRegistration')

      await expect(
        service.purchaseDomainForCampaign(
          campaignWithUser,
          domainName,
          maxPrice,
        ),
      ).rejects.toBeInstanceOf(ConflictException)

      expect(mockPrisma.domain.create).not.toHaveBeenCalled()
      expect(mockPrisma.$transaction).not.toHaveBeenCalled()
      expect(completeSpy).not.toHaveBeenCalled()
    })

    it('marks the Domain row inactive and re-throws when inline registration fails', async () => {
      mockPrisma.website.findUnique.mockResolvedValue(baseWebsite)
      mockPrisma.website.findUniqueOrThrow.mockResolvedValue({
        content: { contact: {} },
      })
      mockRoute53.checkDomainAvailability.mockResolvedValue({
        Availability: DomainAvailability.AVAILABLE,
      })
      mockVercel.checkDomainPrice.mockResolvedValue({ price: 12 })
      const created = {
        ...mockDomain,
        id: 555,
        name: domainName,
        paymentId: null,
        price: new Decimal(12),
      }
      mockPrisma.domain.create.mockResolvedValue(created)
      const registrationError = new Error(
        'Error getting domain details from Vercel:',
      )
      vi.spyOn(service, 'completeDomainRegistration').mockRejectedValue(
        registrationError,
      )

      await expect(
        service.purchaseDomainForCampaign(
          campaignWithUser,
          domainName,
          maxPrice,
        ),
      ).rejects.toBe(registrationError)

      expect(mockPrisma.domain.update).toHaveBeenCalledWith({
        where: { id: created.id },
        data: { status: DomainStatus.inactive },
      })
      expect(mockPrisma.domain.findUniqueOrThrow).not.toHaveBeenCalled()
    })
  })

  describe('completeDomainRegistration', () => {
    const contact: RegisterDomainSchema = {
      firstName: 'Mary',
      lastName: "O'Neill",
      email: 'mary@example.com',
      phoneNumber: '+15555555555',
      addressLine1: '1 Main St',
      city: 'New York',
      state: 'NY',
      zipCode: '10001',
    }

    it('throws BILLING_DOMAIN_PAYMENT_ID_MISSING (not a retrieval error) when paymentId is null', async () => {
      Object.assign(mockPrisma.domain, {
        findFirst: vi.fn(),
        findFirstOrThrow: vi.fn(),
        findUnique: vi.fn(),
        count: vi.fn(),
      })
      service.onModuleInit()
      vi.spyOn(service, 'shouldEnableDomainPurchase').mockReturnValue(true)
      Object.assign(mockVercel, {
        getDomainDetails: vi.fn().mockRejectedValue(new Error('not found')),
        isVercelNotFoundError: vi.fn().mockReturnValue(true),
        purchaseDomain: vi.fn().mockResolvedValue({}),
        getProjectDomain: vi.fn().mockRejectedValue(new Error('not found')),
        addDomainToProject: vi.fn().mockResolvedValue({}),
      })
      mockPrisma.domain.findUniqueOrThrow.mockResolvedValue({
        ...mockDomain,
        paymentId: null,
        price: new Decimal(12),
      })

      const err = await service
        .completeDomainRegistration(10, contact)
        .catch((e: unknown) => e)

      expect(err).toBeInstanceOf(BadRequestException)
      expect((err as BadRequestException).getResponse()).toMatchObject({
        errorCode: 'BILLING_DOMAIN_PAYMENT_ID_MISSING',
      })
      expect(mockPayments.retrievePayment).not.toHaveBeenCalled()
    })

    it('skips the payment guard when skipPaymentVerification is true', async () => {
      Object.assign(mockPrisma.domain, {
        findFirst: vi.fn(),
        findFirstOrThrow: vi.fn(),
        findUnique: vi.fn(),
        count: vi.fn(),
      })
      service.onModuleInit()
      vi.spyOn(service, 'shouldEnableDomainPurchase').mockReturnValue(true)
      const purchaseDomainMock = vi.fn().mockResolvedValue({})
      Object.assign(mockVercel, {
        getDomainDetails: vi.fn().mockRejectedValue(new Error('not found')),
        isVercelNotFoundError: vi.fn().mockReturnValue(true),
        purchaseDomain: purchaseDomainMock,
        getProjectDomain: vi.fn().mockRejectedValue(new Error('not found')),
        addDomainToProject: vi.fn().mockResolvedValue({}),
      })
      mockPrisma.domain.findUniqueOrThrow.mockResolvedValue({
        ...mockDomain,
        paymentId: null,
        price: new Decimal(12),
      })

      await service.completeDomainRegistration(10, contact, {
        skipPaymentVerification: true,
      })

      expect(mockPayments.retrievePayment).not.toHaveBeenCalled()
      expect(purchaseDomainMock).toHaveBeenCalled()
      expect(mockPrisma.domain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: DomainStatus.submitted }),
        }),
      )
    })
  })

  describe('setupDomainEmailForwarding', () => {
    it('always forwards to the candidate-domains@goodparty.org alias', async () => {
      mockPrisma.website.findUnique.mockResolvedValue({
        content: { contact: { phone: '555' } },
      })

      await service.setupDomainEmailForwarding(mockDomain)

      expect(mockForwardEmail.createCatchAllAlias).toHaveBeenCalledWith(
        'candidate-domains@goodparty.org',
        expect.objectContaining({ id: 'fed_1' }),
      )
      expect(mockForwardEmail.updateDomainAlias).not.toHaveBeenCalled()
    })

    it('updates existing aliases to point at the GP alias', async () => {
      mockForwardEmail.getCatchAllDomainAliases.mockResolvedValue([
        { id: 'existing_alias' },
      ])
      mockPrisma.website.findUnique.mockResolvedValue({
        content: {},
      })

      await service.setupDomainEmailForwarding(mockDomain)

      expect(mockForwardEmail.updateDomainAlias).toHaveBeenCalledWith(
        'existing_alias',
        'candidate-domains@goodparty.org',
        expect.objectContaining({ id: 'fed_1' }),
      )
      expect(mockForwardEmail.createCatchAllAlias).not.toHaveBeenCalled()
    })

    it('persists info@<domain> on Website.content.contact.email, preserving other content', async () => {
      mockPrisma.website.findUnique.mockResolvedValue({
        content: {
          main: { title: 'keep me' },
          contact: { phone: '555-555-5555' },
        },
        campaignId: 42,
      })

      await service.setupDomainEmailForwarding(mockDomain)

      expect(mockPrisma.website.findUnique).toHaveBeenCalledWith({
        where: { id: mockDomain.websiteId },
        select: { content: true, campaignId: true },
      })
      expect(mockPrisma.website.update).toHaveBeenCalledWith({
        where: { id: mockDomain.websiteId },
        data: {
          content: {
            main: { title: 'keep me' },
            contact: {
              phone: '555-555-5555',
              email: `info@${mockDomain.name}`,
            },
          },
        },
      })
    })

    it('persists campaignEmail on the Campaign row', async () => {
      mockPrisma.website.findUnique.mockResolvedValue({
        content: {},
        campaignId: 42,
      })

      await service.setupDomainEmailForwarding(mockDomain)

      expect(mockPrisma.$transaction).toHaveBeenCalledOnce()
      expect(mockPrisma.campaign.update).toHaveBeenCalledWith({
        where: { id: 42 },
        data: { campaignEmail: `info@${mockDomain.name}` },
      })
    })

    it('reads website content after transaction starts', async () => {
      mockPrisma.website.findUnique.mockResolvedValue({
        content: {},
        campaignId: 42,
      })

      await service.setupDomainEmailForwarding(mockDomain)

      expect(mockPrisma.$transaction).toHaveBeenCalledOnce()
      expect(mockPrisma.website.findUnique).toHaveBeenCalledOnce()
      expect(
        mockPrisma.website.findUnique.mock.invocationCallOrder[0],
      ).toBeGreaterThan(mockPrisma.$transaction.mock.invocationCallOrder[0])
    })

    it('skips persistence when no Website row exists for the domain', async () => {
      mockPrisma.website.findUnique.mockResolvedValue(null)

      await service.setupDomainEmailForwarding(mockDomain)

      expect(mockPrisma.website.update).not.toHaveBeenCalled()
      expect(mockPrisma.campaign.update).not.toHaveBeenCalled()
    })

    it('returns ForwardEmail domain even when campaign email persistence fails', async () => {
      mockPrisma.website.findUnique.mockResolvedValue({
        content: {},
        campaignId: 42,
      })
      mockPrisma.website.update.mockRejectedValue(new Error('db write failed'))

      const result = await service.setupDomainEmailForwarding(mockDomain)

      expect(result).toMatchObject({ id: 'fed_1' })
    })
  })

  describe('submitRegistrantVerification', () => {
    const verifyUrl =
      'https://vercel.com/verify-domain?token=abc&domain=foo.com'

    it('submits to Vercel, confirms via getDomainDetails, and stamps registrantVerifiedAt', async () => {
      const unverified = { ...mockDomain, name: 'foo.com' }
      const verifiedAt = new Date('2026-05-13T10:00:00.000Z')
      mockPrisma.domain.findUnique.mockResolvedValue(unverified)
      mockVercel.getDomainDetails.mockResolvedValue({
        domain: { verified: true, name: 'foo.com' },
      })
      mockPrisma.domain.findUniqueOrThrow.mockResolvedValue({
        ...unverified,
        registrantVerifiedAt: verifiedAt,
      })

      const result = await service.submitRegistrantVerification(
        'FOO.COM',
        verifyUrl,
      )

      expect(mockPrisma.domain.findUnique).toHaveBeenCalledWith({
        where: { name: 'foo.com' },
      })
      expect(
        mockVercel.submitDomainRegistrantVerification,
      ).toHaveBeenCalledWith(verifyUrl)
      expect(mockVercel.getDomainDetails).toHaveBeenCalledWith('foo.com')
      expect(mockPrisma.domain.updateMany).toHaveBeenCalledWith({
        where: { id: unverified.id, registrantVerifiedAt: null },
        data: { registrantVerifiedAt: expect.any(Date) },
      })
      expect(result).toMatchObject({
        domain: 'foo.com',
        alreadyVerified: false,
        registrantVerifiedAt: verifiedAt,
      })
    })

    it('does NOT stamp when Vercel still reports the domain as unverified after submit', async () => {
      const unverified = { ...mockDomain, name: 'foo.com' }
      mockPrisma.domain.findUnique.mockResolvedValue(unverified)
      mockVercel.getDomainDetails.mockResolvedValue({
        domain: { verified: false, name: 'foo.com' },
      })

      await expect(
        service.submitRegistrantVerification('foo.com', verifyUrl),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_GATEWAY })

      expect(mockVercel.submitDomainRegistrantVerification).toHaveBeenCalled()
      expect(mockPrisma.domain.updateMany).not.toHaveBeenCalled()
    })

    it('wraps getDomainDetails failures as BadGatewayException without stamping', async () => {
      mockPrisma.domain.findUnique.mockResolvedValue({
        ...mockDomain,
        name: 'foo.com',
      })
      mockVercel.getDomainDetails.mockRejectedValueOnce(
        new Error('vercel API timed out'),
      )

      await expect(
        service.submitRegistrantVerification('foo.com', verifyUrl),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_GATEWAY })
      expect(mockPrisma.domain.updateMany).not.toHaveBeenCalled()
    })

    it('is idempotent — already-verified domains are not re-submitted', async () => {
      const alreadyVerifiedAt = new Date('2026-05-12T00:00:00.000Z')
      mockPrisma.domain.findUnique.mockResolvedValue({
        ...mockDomain,
        name: 'foo.com',
        registrantVerifiedAt: alreadyVerifiedAt,
      })

      const result = await service.submitRegistrantVerification(
        'foo.com',
        verifyUrl,
      )

      expect(
        mockVercel.submitDomainRegistrantVerification,
      ).not.toHaveBeenCalled()
      expect(mockPrisma.domain.updateMany).not.toHaveBeenCalled()
      expect(result).toEqual({
        domain: 'foo.com',
        alreadyVerified: true,
        registrantVerifiedAt: alreadyVerifiedAt,
      })
    })

    it('throws NotFoundException when the domain is not managed', async () => {
      mockPrisma.domain.findUnique.mockResolvedValue(null)

      await expect(
        service.submitRegistrantVerification('unknown.com', verifyUrl),
      ).rejects.toBeInstanceOf(NotFoundException)
      expect(
        mockVercel.submitDomainRegistrantVerification,
      ).not.toHaveBeenCalled()
    })

    it('wraps Vercel failures as BadGatewayException and does not stamp', async () => {
      mockPrisma.domain.findUnique.mockResolvedValue({
        ...mockDomain,
        name: 'foo.com',
      })
      mockVercel.submitDomainRegistrantVerification.mockRejectedValueOnce(
        new Error('500 from vercel'),
      )

      await expect(
        service.submitRegistrantVerification('foo.com', verifyUrl),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_GATEWAY })
      expect(mockPrisma.domain.updateMany).not.toHaveBeenCalled()
    })
  })

  describe('backfillDomainEmailRedirects', () => {
    it('enqueues a message without forwardingEmailAddress', async () => {
      vi.spyOn(service, 'shouldEnableDomainPurchase').mockReturnValue(true)
      mockPrisma.domain.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }])

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (service as any).backfillDomainEmailRedirects()

      expect(mockPrisma.domain.findMany).toHaveBeenCalledWith({
        where: {
          emailForwardingDomainId: null,
          status: {
            in: [DomainStatus.submitted, DomainStatus.registered],
          },
        },
      })
      expect(mockQueue.sendMessage).toHaveBeenCalledTimes(2)
      expect(mockQueue.sendMessage).toHaveBeenNthCalledWith(
        1,
        {
          type: QueueType.DOMAIN_EMAIL_FORWARDING,
          data: { domainId: 1 },
        },
        MessageGroup.domainEmailRedirect,
      )
      expect(mockQueue.sendMessage).toHaveBeenNthCalledWith(
        2,
        {
          type: QueueType.DOMAIN_EMAIL_FORWARDING,
          data: { domainId: 2 },
        },
        MessageGroup.domainEmailRedirect,
      )
    })
  })
})
