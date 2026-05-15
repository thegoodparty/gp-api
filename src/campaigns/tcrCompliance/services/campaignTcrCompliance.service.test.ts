import { Test, TestingModule } from '@nestjs/testing'
import { BadGatewayException, BadRequestException } from '@nestjs/common'
import { CommitteeType, OfficeLevel, TcrComplianceStatus } from '@prisma/client'
import { ComplianceStage } from '@goodparty_org/contracts'
import { PinoLogger } from 'nestjs-pino'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CampaignTcrComplianceService } from './campaignTcrCompliance.service'
import { PeerlyIdentityService } from '../../../vendors/peerly/services/peerlyIdentity.service'
import { WebsitesService } from '../../../websites/services/websites.service'
import { CampaignsService } from '../../services/campaigns.service'
import { QueueProducerService } from '../../../queue/producer/queueProducer.service'
import { PrismaService } from '@/prisma/prisma.service'
import { MessageGroup, QueueType } from '../../../queue/queue.types'
import { CLERK_CLIENT_PROVIDER_TOKEN } from '@/vendors/clerk/providers/clerk-client.provider'
import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import {
  createMockUser,
  createMockCampaign,
} from '@/shared/test-utils/mockData.util'

const ACTOR_TOKEN_URL = 'https://clerk.example.com/v1/tickets/accept?ticket=abc'
const BROKER_CLERK_ID = 'broker_clerk_xyz'

describe('CampaignTcrComplianceService - createAgentic', () => {
  let service: CampaignTcrComplianceService
  let mockPeerly: { getIdentities: ReturnType<typeof vi.fn> }
  let mockWebsites: { findFirstOrThrow: ReturnType<typeof vi.fn> }
  let mockCampaigns: { updateJsonFields: ReturnType<typeof vi.fn> }
  let mockQueue: { sendMessage: ReturnType<typeof vi.fn> }
  let mockModel: {
    findUnique: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
    delete: ReturnType<typeof vi.fn>
  }
  let mockPrisma: { tcrCompliance: typeof mockModel }
  let mockClerk: {
    actorTokens: { create: ReturnType<typeof vi.fn> }
  }

  const user = createMockUser({ clerkId: 'user_clerk_abc' })
  const campaign = createMockCampaign({
    userId: user.id,
    formattedAddress: '123 Main St',
  })

  const basePayload = {
    ein: '12-3456789',
    committeeName: 'Test Committee',
    filingUrl: 'https://example.com/filing',
    email: 'test@example.com',
    phone: '5555555555',
    officeLevel: OfficeLevel.state,
    committeeType: CommitteeType.CANDIDATE,
    placeId: 'place-123',
    formattedAddress: '123 Main St',
  }

  beforeEach(async () => {
    mockPeerly = { getIdentities: vi.fn() }
    mockWebsites = { findFirstOrThrow: vi.fn() }
    mockCampaigns = {
      updateJsonFields: vi.fn().mockResolvedValue(campaign),
    }
    mockQueue = { sendMessage: vi.fn().mockResolvedValue(undefined) }
    mockModel = {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi
        .fn()
        .mockImplementation(({ data }) =>
          Promise.resolve({ id: 'tcr-new', ...data }),
        ),
      delete: vi.fn().mockResolvedValue(undefined),
    }
    mockPrisma = { tcrCompliance: mockModel }
    mockClerk = {
      actorTokens: {
        create: vi.fn().mockResolvedValue({ url: ACTOR_TOKEN_URL }),
      },
    }
    process.env.BROKER_SERVICE_ACCOUNT_CLERK_ID = BROKER_CLERK_ID

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PeerlyIdentityService, useValue: mockPeerly },
        { provide: WebsitesService, useValue: mockWebsites },
        { provide: CampaignsService, useValue: mockCampaigns },
        { provide: QueueProducerService, useValue: mockQueue },
        { provide: CLERK_CLIENT_PROVIDER_TOKEN, useValue: mockClerk },
        { provide: PinoLogger, useValue: createMockLogger() },
        CampaignTcrComplianceService,
      ],
    }).compile()

    service = module.get(CampaignTcrComplianceService)

    vi.clearAllMocks()
  })

  afterEach(() => {
    delete process.env.BROKER_SERVICE_ACCOUNT_CLERK_ID
  })

  it('persists with pipelineStatus = pending_domain_purchase and the place fields', async () => {
    await service.createAgentic(user, campaign, {
      ...basePayload,
      websiteDomain: 'example.com',
    })

    expect(mockCampaigns.updateJsonFields).toHaveBeenCalledWith(campaign.id, {
      details: {
        einNumber: basePayload.ein,
        campaignCommittee: basePayload.committeeName,
        pipelineStatus: ComplianceStage.pending_domain_purchase,
      },
      placeId: basePayload.placeId,
      formattedAddress: basePayload.formattedAddress,
    })
  })

  it('persists websiteDomain as empty string when missing', async () => {
    await service.createAgentic(user, campaign, basePayload)

    expect(mockModel.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        websiteDomain: '',
        campaignId: campaign.id,
      }),
    })
  })

  it('does not call Peerly', async () => {
    await service.createAgentic(user, campaign, {
      ...basePayload,
      websiteDomain: 'example.com',
    })

    expect(mockPeerly.getIdentities).not.toHaveBeenCalled()
  })

  it('enqueues the agentic kickoff with the minted actor token URL', async () => {
    await service.createAgentic(user, campaign, basePayload)

    expect(mockClerk.actorTokens.create).toHaveBeenCalledWith({
      userId: user.clerkId,
      actor: { sub: BROKER_CLERK_ID },
      expiresInSeconds: 3600,
    })
    expect(mockQueue.sendMessage).toHaveBeenCalledTimes(1)
    const [message, group, options] = mockQueue.sendMessage.mock.calls[0]
    expect(message).toEqual({
      type: QueueType.AGENTIC_COMPLIANCE_KICKOFF,
      data: {
        campaignId: campaign.id,
        tcrComplianceId: 'tcr-new',
        clerkUserId: user.clerkId,
        actorTokenUrl: ACTOR_TOKEN_URL,
      },
    })
    expect(group).toBe(
      `${MessageGroup.agenticComplianceKickoff}-${campaign.id}`,
    )
    expect(options).toEqual({
      deduplicationId: 'agentic-compliance-tcr-new',
    })
  })

  it('throws BadGatewayException when BROKER_SERVICE_ACCOUNT_CLERK_ID is unset', async () => {
    delete process.env.BROKER_SERVICE_ACCOUNT_CLERK_ID

    await expect(
      service.createAgentic(user, campaign, basePayload),
    ).rejects.toThrow(BadGatewayException)
  })

  it('returns the existing record without re-kicking when one is in-flight', async () => {
    const existing = {
      id: 'tcr-existing',
      campaignId: campaign.id,
      status: TcrComplianceStatus.pending,
    }
    mockModel.findUnique.mockResolvedValue(existing)

    const result = await service.createAgentic(user, campaign, basePayload)

    expect(result).toEqual(existing)
    expect(mockModel.create).not.toHaveBeenCalled()
    expect(mockCampaigns.updateJsonFields).not.toHaveBeenCalled()
    expect(mockQueue.sendMessage).not.toHaveBeenCalled()
    expect(mockClerk.actorTokens.create).not.toHaveBeenCalled()
  })

  it('restarts when the existing record is in a terminal failure state', async () => {
    const existing = {
      id: 'tcr-failed',
      campaignId: campaign.id,
      status: TcrComplianceStatus.error,
    }
    mockModel.findUnique.mockResolvedValue(existing)

    await service.createAgentic(user, campaign, basePayload)

    expect(mockModel.delete).toHaveBeenCalledWith({
      where: { id: 'tcr-failed' },
    })
    expect(mockModel.create).toHaveBeenCalledTimes(1)
    expect(mockQueue.sendMessage).toHaveBeenCalledTimes(1)
  })

  it('throws BadRequestException when the user has no Clerk ID', async () => {
    const userWithoutClerk = createMockUser({ clerkId: null })

    await expect(
      service.createAgentic(userWithoutClerk, campaign, basePayload),
    ).rejects.toThrow(BadRequestException)
  })
})
