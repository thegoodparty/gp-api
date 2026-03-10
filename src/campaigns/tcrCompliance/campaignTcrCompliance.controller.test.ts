import { Test, TestingModule } from '@nestjs/testing'
import { CommitteeType, TcrComplianceStatus } from '@prisma/client'
import { AnalyticsService } from 'src/analytics/analytics.service'
import { EVENTS } from 'src/vendors/segment/segment.types'
import { PinoLogger } from 'nestjs-pino'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CampaignTcrComplianceController } from './campaignTcrCompliance.controller'
import { CampaignTcrComplianceService } from './services/campaignTcrCompliance.service'
import { UsersService } from '../../users/services/users.service'
import { CampaignsService } from '../services/campaigns.service'
import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import {
  createMockUser,
  createMockCampaign,
} from '@/shared/test-utils/mockData.util'

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
    retrieveCampaignVerifyToken: ReturnType<typeof vi.fn>
    submitCampaignVerifyToken: ReturnType<typeof vi.fn>
    model: { update: ReturnType<typeof vi.fn> }
  }
  let mockUserService: { findByCampaign: ReturnType<typeof vi.fn> }
  let mockCampaignsService: { updateJsonFields: ReturnType<typeof vi.fn> }

  beforeEach(async () => {
    mockAnalytics = {
      track: vi.fn().mockResolvedValue(undefined),
    }

    mockTcrService = {
      fetchByCampaignId: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(mockTcrCompliance),
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: UsersService, useValue: mockUserService },
        {
          provide: CampaignTcrComplianceService,
          useValue: mockTcrService,
        },
        { provide: CampaignsService, useValue: mockCampaignsService },
        { provide: AnalyticsService, useValue: mockAnalytics },
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
})
