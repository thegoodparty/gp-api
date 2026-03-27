import { Test, TestingModule } from '@nestjs/testing'
import { Domain, DomainStatus } from '@prisma/client'
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
import { createMockClerkEnricher } from '@/shared/test-utils/mockClerkEnricher.util'
import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import { ClerkUserEnricherService } from '@/vendors/clerk/services/clerk-user-enricher.service'
import { createMockUser } from '@/shared/test-utils/mockData.util'

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
  let mockPrisma: {
    domain: {
      findMany: ReturnType<typeof vi.fn>
      update: ReturnType<typeof vi.fn>
    }
    website: { findUniqueOrThrow: ReturnType<typeof vi.fn> }
  }

  beforeEach(async () => {
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
      },
      website: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          content: { contact: {} },
          domain: mockDomain,
        }),
      },
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AwsRoute53Service, useValue: {} },
        { provide: VercelService, useValue: {} },
        { provide: PaymentsService, useValue: mockPayments },
        { provide: StripeService, useValue: mockStripe },
        { provide: ForwardEmailService, useValue: {} },
        { provide: QueueProducerService, useValue: {} },
        { provide: AnalyticsService, useValue: mockAnalytics },
        {
          provide: ClerkUserEnricherService,
          useValue: createMockClerkEnricher(),
        },
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
})
