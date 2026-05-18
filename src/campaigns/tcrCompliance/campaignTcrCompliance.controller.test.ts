import { Test, TestingModule } from '@nestjs/testing'
import { HttpStatus, NotFoundException } from '@nestjs/common'
import { HTTP_CODE_METADATA } from '@nestjs/common/constants'
import { CommitteeType, TcrComplianceStatus } from '@prisma/client'
import { AnalyticsService } from 'src/analytics/analytics.service'
import { EVENTS } from 'src/vendors/segment/segment.types'
import { PinoLogger } from 'nestjs-pino'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CampaignTcrComplianceController } from './campaignTcrCompliance.controller'
import { CampaignTcrComplianceService } from './services/campaignTcrCompliance.service'
import { ComplianceStateService } from './services/complianceState.service'
import { ComplianceStage } from '@goodparty_org/contracts'
import { UsersService } from '../../users/services/users.service'
import { CampaignsService } from '../services/campaigns.service'
import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import {
  createMockUser,
  createMockCampaign,
} from '@/shared/test-utils/mockData.util'
import { ClerkUserEnricherService } from '@/vendors/clerk/services/clerk-user-enricher.service'
import { createMockClerkEnricher } from '@/shared/test-utils/mockClerkEnricher.util'

const mockUser = createMockUser()
const mockCampaign = createMockCampaign({ userId: mockUser.id })

const mockTcrCompliance = {
  id: 'tcr-123',
  campaignId: 1,
  peerlyIdentityId: 'peerly-123',
  status: TcrComplianceStatus.submitted,
}

describe('CampaignTcrComplianceController', () => {
  let controller: CampaignTcrComplianceController
  let mockAnalytics: { track: ReturnType<typeof vi.fn> }
  let mockTcrService: {
    fetchByCampaignId: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
    createAgentic: ReturnType<typeof vi.fn>
    retrieveCampaignVerifyToken: ReturnType<typeof vi.fn>
    submitCampaignVerifyToken: ReturnType<typeof vi.fn>
    model: { update: ReturnType<typeof vi.fn> }
  }
  let mockUserService: { findByCampaign: ReturnType<typeof vi.fn> }
  let mockCampaignsService: { updateJsonFields: ReturnType<typeof vi.fn> }
  let mockComplianceStateService: {
    findStateForCampaign: ReturnType<typeof vi.fn>
  }

  beforeEach(async () => {
    mockAnalytics = {
      track: vi.fn().mockResolvedValue(undefined),
    }

    mockTcrService = {
      fetchByCampaignId: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(mockTcrCompliance),
      createAgentic: vi.fn().mockResolvedValue(mockTcrCompliance),
      retrieveCampaignVerifyToken: vi.fn().mockResolvedValue('cv-token-123'),
      submitCampaignVerifyToken: vi.fn().mockResolvedValue({ brand: 'ok' }),
      model: { update: vi.fn().mockResolvedValue(mockTcrCompliance) },
    }

    mockUserService = {
      findByCampaign: vi.fn().mockResolvedValue(mockUser),
    }

    mockCampaignsService = {
      updateJsonFields: vi.fn().mockResolvedValue(mockCampaign),
    }

    mockComplianceStateService = {
      findStateForCampaign: vi.fn().mockResolvedValue({
        stage: ComplianceStage.awaiting_pin,
        domain: null,
        websiteId: null,
        peerlyVerificationId: null,
      }),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: UsersService, useValue: mockUserService },
        {
          provide: CampaignTcrComplianceService,
          useValue: mockTcrService,
        },
        {
          provide: ComplianceStateService,
          useValue: mockComplianceStateService,
        },
        { provide: CampaignsService, useValue: mockCampaignsService },
        { provide: AnalyticsService, useValue: mockAnalytics },
        {
          provide: ClerkUserEnricherService,
          useValue: createMockClerkEnricher(),
        },
        { provide: PinoLogger, useValue: createMockLogger() },
        CampaignTcrComplianceController,
      ],
    }).compile()

    controller = module.get<CampaignTcrComplianceController>(
      CampaignTcrComplianceController,
    )

    vi.clearAllMocks()
  })

  describe('createTcrCompliance - Segment event tracking', () => {
    const tcrComplianceDto = {
      ein: '12-3456789',
      committeeName: 'Test Committee',
      websiteDomain: 'example.com',
      filingUrl: 'https://fec.gov/filing',
      email: 'test@example.com',
      phone: '5555555555',
      officeLevel: 'federal' as const,
      fecCommitteeId: 'C00123456',
      committeeType: CommitteeType.HOUSE,
      placeId: 'place-123',
      formattedAddress: '123 Main St',
    }

    it('should track ComplianceFormSubmitted event after successful creation', async () => {
      await controller.createTcrCompliance(mockCampaign, tcrComplianceDto)

      expect(mockAnalytics.track).toHaveBeenCalledWith(
        mockUser.id,
        EVENTS.Outreach.ComplianceFormSubmitted,
        { source: 'compliance_flow' },
      )
    })

    it('should not track event when compliance already exists', async () => {
      mockTcrService.fetchByCampaignId.mockResolvedValue(mockTcrCompliance)

      await expect(
        controller.createTcrCompliance(mockCampaign, tcrComplianceDto),
      ).rejects.toThrow()

      expect(mockAnalytics.track).not.toHaveBeenCalled()
    })

    it('should still return the result when analytics tracking fails', async () => {
      mockAnalytics.track.mockRejectedValue(new Error('Segment unavailable'))

      const result = await controller.createTcrCompliance(
        mockCampaign,
        tcrComplianceDto,
      )

      expect(result).toEqual(mockTcrCompliance)
    })
  })

  describe('createAgenticTcrCompliance', () => {
    const agenticDto = {
      ein: '12-3456789',
      committeeName: 'Test Committee',
      filingUrl: 'https://example.com/filing',
      email: 'test@example.com',
      phone: '5555555555',
      officeLevel: 'state' as const,
      committeeType: CommitteeType.CANDIDATE,
      placeId: 'place-123',
      formattedAddress: '123 Main St',
    }

    it('delegates to service.createAgentic and returns the record', async () => {
      const result = await controller.createAgenticTcrCompliance(
        mockCampaign,
        agenticDto,
      )

      expect(mockTcrService.createAgentic).toHaveBeenCalledTimes(1)
      expect(mockTcrService.createAgentic).toHaveBeenCalledWith(
        mockUser,
        mockCampaign,
        expect.objectContaining({
          ein: agenticDto.ein,
          committeeName: agenticDto.committeeName,
        }),
      )
      expect(result).toEqual(mockTcrCompliance)
    })

    it('accepts a payload with no websiteDomain', async () => {
      await controller.createAgenticTcrCompliance(mockCampaign, agenticDto)

      const payload = mockTcrService.createAgentic.mock.calls[0][2]
      expect(payload.websiteDomain).toBeUndefined()
    })

    it('passes through whatever the service returns (idempotent path lives in service)', async () => {
      const existing = { ...mockTcrCompliance, id: 'tcr-existing' }
      mockTcrService.createAgentic.mockResolvedValue(existing)

      const result = await controller.createAgenticTcrCompliance(
        mockCampaign,
        agenticDto,
      )

      expect(result).toEqual(existing)
      expect(mockTcrService.createAgentic).toHaveBeenCalledTimes(1)
    })

    it('tracks ComplianceFormSubmitted with the agentic source', async () => {
      await controller.createAgenticTcrCompliance(mockCampaign, agenticDto)

      expect(mockAnalytics.track).toHaveBeenCalledWith(
        mockUser.id,
        EVENTS.Outreach.ComplianceFormSubmitted,
        { source: 'agentic_compliance_flow' },
      )
    })

    it('still returns the result when analytics tracking fails', async () => {
      mockAnalytics.track.mockRejectedValue(new Error('Segment unavailable'))

      const result = await controller.createAgenticTcrCompliance(
        mockCampaign,
        agenticDto,
      )

      expect(result).toEqual(mockTcrCompliance)
    })

    it('responds with HTTP 202 Accepted', () => {
      const httpCode = Reflect.getMetadata(
        HTTP_CODE_METADATA,
        controller.createAgenticTcrCompliance,
      )
      expect(httpCode).toBe(HttpStatus.ACCEPTED)
    })

    it('throws NotFoundException when the campaign has no user', async () => {
      mockUserService.findByCampaign.mockResolvedValue(null)

      await expect(
        controller.createAgenticTcrCompliance(mockCampaign, agenticDto),
      ).rejects.toThrow(NotFoundException)
      expect(mockTcrService.createAgentic).not.toHaveBeenCalled()
      expect(mockAnalytics.track).not.toHaveBeenCalled()
    })
  })

  describe('submitCampaignVerifyPIN - Segment event tracking', () => {
    beforeEach(() => {
      mockTcrService.fetchByCampaignId.mockResolvedValue(mockTcrCompliance)
    })

    it('should track CompliancePinSubmitted event after successful PIN submission', async () => {
      await controller.submitCampaignVerifyPIN(
        mockTcrCompliance.id,
        { pin: '123456' },
        mockUser,
        mockCampaign,
      )

      expect(mockAnalytics.track).toHaveBeenCalledWith(
        mockUser.id,
        EVENTS.Outreach.CompliancePinSubmitted,
        { source: 'compliance_flow' },
      )
    })

    it('should not track event when token retrieval fails', async () => {
      mockTcrService.retrieveCampaignVerifyToken.mockRejectedValue(
        new Error('Invalid PIN'),
      )

      await expect(
        controller.submitCampaignVerifyPIN(
          mockTcrCompliance.id,
          { pin: '000000' },
          mockUser,
          mockCampaign,
        ),
      ).rejects.toThrow()

      expect(mockAnalytics.track).not.toHaveBeenCalled()
    })

    it('should not track event when token is null', async () => {
      mockTcrService.retrieveCampaignVerifyToken.mockResolvedValue(null)

      await expect(
        controller.submitCampaignVerifyPIN(
          mockTcrCompliance.id,
          { pin: '123456' },
          mockUser,
          mockCampaign,
        ),
      ).rejects.toThrow()

      expect(mockAnalytics.track).not.toHaveBeenCalled()
    })

    it('should still return the result when analytics tracking fails', async () => {
      const expectedBrand = { brand: 'ok' }
      mockTcrService.submitCampaignVerifyToken.mockResolvedValue(expectedBrand)
      mockAnalytics.track.mockRejectedValue(new Error('Segment unavailable'))

      const result = await controller.submitCampaignVerifyPIN(
        mockTcrCompliance.id,
        { pin: '123456' },
        mockUser,
        mockCampaign,
      )

      expect(result).toEqual(expectedBrand)
    })
  })

  describe('getMyComplianceState', () => {
    it('delegates to ComplianceStateService with the campaign id', async () => {
      const expectedState = {
        stage: ComplianceStage.pending_website_live,
        domain: {
          name: 'example.org',
          status: 'registered' as const,
          registrantVerifiedAt: null,
        },
        websiteId: 42,
        peerlyVerificationId: null,
      }
      mockComplianceStateService.findStateForCampaign.mockResolvedValue(
        expectedState,
      )

      const result = await controller.getMyComplianceState(mockCampaign)

      expect(
        mockComplianceStateService.findStateForCampaign,
      ).toHaveBeenCalledWith(mockCampaign.id)
      expect(result).toEqual(expectedState)
    })
  })
})
