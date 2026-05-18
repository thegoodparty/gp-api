import { Test, TestingModule } from '@nestjs/testing'
import { BadGatewayException, BadRequestException } from '@nestjs/common'
import { CommitteeType, OfficeLevel, TcrComplianceStatus } from '@prisma/client'
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'
import { PinoLogger } from 'nestjs-pino'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CampaignTcrComplianceService } from './campaignTcrCompliance.service'
import { PeerlyIdentityService } from '../../../vendors/peerly/services/peerlyIdentity.service'
import { WebsitesService } from '../../../websites/services/websites.service'
import { CampaignsService } from '../../services/campaigns.service'
import { CrmCampaignsService } from '../../services/crmCampaigns.service'
import { QueueProducerService } from '../../../queue/producer/queueProducer.service'
import { PrismaService } from '@/prisma/prisma.service'
import { MessageGroup, QueueType } from '../../../queue/queue.types'
import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import {
  createMockUser,
  createMockCampaign,
} from '@/shared/test-utils/mockData.util'

describe('CampaignTcrComplianceService - createAgentic', () => {
  let service: CampaignTcrComplianceService
  let mockPeerly: { getIdentities: ReturnType<typeof vi.fn> }
  let mockWebsites: { findFirstOrThrow: ReturnType<typeof vi.fn> }
  let mockCampaigns: { updateJsonFields: ReturnType<typeof vi.fn> }
  let mockCrm: { trackCampaign: ReturnType<typeof vi.fn> }
  let mockQueue: { sendMessage: ReturnType<typeof vi.fn> }
  let mockModel: {
    findUnique: ReturnType<typeof vi.fn>
    findMany: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
    delete: ReturnType<typeof vi.fn>
    deleteMany: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
  let mockPrisma: {
    tcrCompliance: typeof mockModel
    $transaction: ReturnType<typeof vi.fn>
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
    mockCrm = { trackCampaign: vi.fn().mockResolvedValue(undefined) }
    mockQueue = { sendMessage: vi.fn().mockResolvedValue(undefined) }
    mockModel = {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi
        .fn()
        .mockImplementation(({ data }) =>
          Promise.resolve({ id: 'tcr-new', ...data }),
        ),
      delete: vi.fn().mockResolvedValue(undefined),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      update: vi.fn().mockResolvedValue(undefined),
    }
    mockPrisma = {
      tcrCompliance: mockModel,
      $transaction: vi.fn(async (cb: (tx: typeof mockPrisma) => unknown) =>
        cb(mockPrisma),
      ),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PeerlyIdentityService, useValue: mockPeerly },
        { provide: WebsitesService, useValue: mockWebsites },
        { provide: CampaignsService, useValue: mockCampaigns },
        { provide: CrmCampaignsService, useValue: mockCrm },
        { provide: QueueProducerService, useValue: mockQueue },
        { provide: PinoLogger, useValue: createMockLogger() },
        CampaignTcrComplianceService,
      ],
    }).compile()

    service = module.get(CampaignTcrComplianceService)

    vi.clearAllMocks()
  })

  it('persists ein/committee/place fields, sharing the outer transaction', async () => {
    await service.createAgentic(user, campaign, {
      ...basePayload,
      websiteDomain: 'example.com',
    })

    expect(mockCampaigns.updateJsonFields).toHaveBeenCalledWith(
      campaign.id,
      {
        details: {
          einNumber: basePayload.ein,
          campaignCommittee: basePayload.committeeName,
        },
        placeId: basePayload.placeId,
        formattedAddress: basePayload.formattedAddress,
      },
      false,
      undefined,
      mockPrisma,
    )
    expect(mockCrm.trackCampaign).toHaveBeenCalledWith(campaign.id)
  })

  it('does not call CRM tracking if the transaction throws', async () => {
    mockCampaigns.updateJsonFields.mockResolvedValueOnce(null)

    await expect(
      service.createAgentic(user, campaign, basePayload),
    ).rejects.toThrow()
    expect(mockCrm.trackCampaign).not.toHaveBeenCalled()
  })

  it('still returns the record when CRM tracking fails after the kickoff', async () => {
    mockCrm.trackCampaign.mockRejectedValueOnce(new Error('HubSpot down'))

    const result = await service.createAgentic(user, campaign, basePayload)

    expect(mockQueue.sendMessage).toHaveBeenCalledTimes(1)
    expect(result).toEqual(expect.objectContaining({ id: 'tcr-new' }))
  })

  it('stamps kickoffSentAt after a successful kickoff send', async () => {
    await service.createAgentic(user, campaign, basePayload)

    expect(mockModel.update).toHaveBeenCalledWith({
      where: { id: 'tcr-new' },
      data: { kickoffSentAt: expect.any(Date) },
    })
  })

  it('marks the record error and re-throws if SQS sendMessage fails', async () => {
    const sqsErr = new Error('SQS unavailable')
    mockQueue.sendMessage.mockRejectedValueOnce(sqsErr)

    await expect(
      service.createAgentic(user, campaign, basePayload),
    ).rejects.toBe(sqsErr)

    expect(mockModel.update).toHaveBeenCalledWith({
      where: { id: 'tcr-new' },
      data: { status: TcrComplianceStatus.error },
    })
    expect(mockCrm.trackCampaign).not.toHaveBeenCalled()
  })

  it('preserves the original SQS error if the fallback status update also fails', async () => {
    const sqsErr = new Error('SQS unavailable')
    const updateErr = new Error('DB unavailable')
    mockQueue.sendMessage.mockRejectedValueOnce(sqsErr)
    mockModel.update.mockRejectedValueOnce(updateErr)

    await expect(
      service.createAgentic(user, campaign, basePayload),
    ).rejects.toBe(sqsErr)
  })

  it('sends the kickoff before tracking CRM (CRM failure cannot strand the record)', async () => {
    const callOrder: string[] = []
    mockQueue.sendMessage.mockImplementation(() => {
      callOrder.push('sendMessage')
      return Promise.resolve()
    })
    mockCrm.trackCampaign.mockImplementation(() => {
      callOrder.push('trackCampaign')
      return Promise.resolve()
    })

    await service.createAgentic(user, campaign, basePayload)

    expect(callOrder).toEqual(['sendMessage', 'trackCampaign'])
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

  it('enqueues the agentic kickoff with only non-sensitive routing data', async () => {
    await service.createAgentic(user, campaign, basePayload)

    expect(mockQueue.sendMessage).toHaveBeenCalledTimes(1)
    const [message, group, options] = mockQueue.sendMessage.mock.calls[0]
    expect(message).toEqual({
      type: QueueType.AGENTIC_COMPLIANCE_KICKOFF,
      data: {
        campaignId: campaign.id,
        tcrComplianceId: 'tcr-new',
        clerkUserId: user.clerkId,
      },
    })
    expect(group).toBe(
      `${MessageGroup.agenticComplianceKickoff}-${campaign.id}`,
    )
    expect(options).toEqual({
      deduplicationId: 'agentic-compliance-tcr-new',
      throwOnError: true,
    })
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
  })

  it('restarts atomically (deleteMany + create in a transaction) on transient error', async () => {
    const existing = {
      id: 'tcr-failed',
      campaignId: campaign.id,
      status: TcrComplianceStatus.error,
    }
    mockModel.findUnique.mockResolvedValue(existing)

    await service.createAgentic(user, campaign, basePayload)

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1)
    expect(mockModel.deleteMany).toHaveBeenCalledWith({
      where: { id: 'tcr-failed' },
    })
    expect(mockModel.create).toHaveBeenCalledTimes(1)
    expect(mockQueue.sendMessage).toHaveBeenCalledTimes(1)
  })

  it('restarts when the existing record was rejected (user is re-submitting corrected data)', async () => {
    const existing = {
      id: 'tcr-rejected',
      campaignId: campaign.id,
      status: TcrComplianceStatus.rejected,
    }
    mockModel.findUnique.mockResolvedValue(existing)

    await service.createAgentic(user, campaign, basePayload)

    expect(mockModel.deleteMany).toHaveBeenCalledWith({
      where: { id: 'tcr-rejected' },
    })
    expect(mockModel.create).toHaveBeenCalledTimes(1)
    expect(mockQueue.sendMessage).toHaveBeenCalledTimes(1)
  })

  it('rolls back the delete when create fails inside the transaction', async () => {
    const existing = {
      id: 'tcr-failed',
      campaignId: campaign.id,
      status: TcrComplianceStatus.error,
    }
    mockModel.findUnique.mockResolvedValue(existing)
    const dbErr = new PrismaClientKnownRequestError('Connection lost', {
      code: 'P1001',
      clientVersion: 'test',
    })
    mockModel.create.mockRejectedValueOnce(dbErr)

    await expect(
      service.createAgentic(user, campaign, basePayload),
    ).rejects.toBe(dbErr)
    expect(mockQueue.sendMessage).not.toHaveBeenCalled()
  })

  it('returns the parallel record when a concurrent submission wins the race', async () => {
    const raced = {
      id: 'tcr-raced',
      campaignId: campaign.id,
      status: TcrComplianceStatus.submitted,
    }
    mockModel.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(raced)
    mockModel.create.mockRejectedValueOnce(
      new PrismaClientKnownRequestError('Unique constraint', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    )

    const result = await service.createAgentic(user, campaign, basePayload)

    expect(result).toEqual(raced)
    expect(mockQueue.sendMessage).not.toHaveBeenCalled()
  })

  it('throws BadGatewayException when P2002 fires but no racing record is found', async () => {
    mockModel.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null)
    mockModel.create.mockRejectedValueOnce(
      new PrismaClientKnownRequestError('Unique constraint', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    )

    await expect(
      service.createAgentic(user, campaign, basePayload),
    ).rejects.toThrow(BadGatewayException)
    expect(mockQueue.sendMessage).not.toHaveBeenCalled()
  })

  it('rethrows non-P2002 Prisma errors from create', async () => {
    const otherErr = new PrismaClientKnownRequestError('Connection lost', {
      code: 'P1001',
      clientVersion: 'test',
    })
    mockModel.create.mockRejectedValueOnce(otherErr)

    await expect(
      service.createAgentic(user, campaign, basePayload),
    ).rejects.toBe(otherErr)
  })

  it('throws BadRequestException when the user has no Clerk ID', async () => {
    const userWithoutClerk = createMockUser({ clerkId: null })

    await expect(
      service.createAgentic(userWithoutClerk, campaign, basePayload),
    ).rejects.toThrow(BadRequestException)
  })

  describe('sweepStrandedAgenticKickoffs', () => {
    const sweep = (svc: CampaignTcrComplianceService) =>
      (
        svc as unknown as { sweepStrandedAgenticKickoffs: () => Promise<void> }
      ).sweepStrandedAgenticKickoffs()

    it('re-enqueues kickoff and stamps kickoffSentAt for stranded records', async () => {
      const stranded = {
        id: 'tcr-stranded',
        campaignId: 99,
        status: TcrComplianceStatus.submitted,
        peerlyIdentityId: null,
        kickoffSentAt: null,
        campaign: { user: { clerkId: 'clerk_stranded' } },
      }
      mockModel.findMany.mockResolvedValueOnce([stranded])

      await sweep(service)

      expect(mockModel.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: TcrComplianceStatus.submitted,
            peerlyIdentityId: null,
            kickoffSentAt: null,
            createdAt: { lt: expect.any(Date) },
          },
        }),
      )
      expect(mockQueue.sendMessage).toHaveBeenCalledTimes(1)
      const [message, group, options] = mockQueue.sendMessage.mock.calls[0]
      expect(message).toEqual({
        type: QueueType.AGENTIC_COMPLIANCE_KICKOFF,
        data: {
          campaignId: 99,
          tcrComplianceId: 'tcr-stranded',
          clerkUserId: 'clerk_stranded',
        },
      })
      expect(group).toBe(`${MessageGroup.agenticComplianceKickoff}-99`)
      expect(options.throwOnError).toBe(true)
      expect(options.deduplicationId).toMatch(
        /^agentic-compliance-tcr-stranded-recover-\d+$/,
      )
      expect(mockModel.update).toHaveBeenCalledWith({
        where: { id: 'tcr-stranded' },
        data: { kickoffSentAt: expect.any(Date) },
      })
    })

    it('skips records whose campaign user has no Clerk id', async () => {
      const stranded = {
        id: 'tcr-no-clerk',
        campaignId: 42,
        status: TcrComplianceStatus.submitted,
        peerlyIdentityId: null,
        kickoffSentAt: null,
        campaign: { user: { clerkId: null } },
      }
      mockModel.findMany.mockResolvedValueOnce([stranded])

      await sweep(service)

      expect(mockQueue.sendMessage).not.toHaveBeenCalled()
      expect(mockModel.update).not.toHaveBeenCalled()
    })

    it('continues after one record fails to re-enqueue', async () => {
      const a = {
        id: 'tcr-a',
        campaignId: 1,
        status: TcrComplianceStatus.submitted,
        peerlyIdentityId: null,
        kickoffSentAt: null,
        campaign: { user: { clerkId: 'clerk_a' } },
      }
      const b = {
        id: 'tcr-b',
        campaignId: 2,
        status: TcrComplianceStatus.submitted,
        peerlyIdentityId: null,
        kickoffSentAt: null,
        campaign: { user: { clerkId: 'clerk_b' } },
      }
      mockModel.findMany.mockResolvedValueOnce([a, b])
      mockQueue.sendMessage
        .mockRejectedValueOnce(new Error('SQS hiccup'))
        .mockResolvedValueOnce(undefined)

      await sweep(service)

      expect(mockQueue.sendMessage).toHaveBeenCalledTimes(2)
      expect(mockModel.update).toHaveBeenCalledTimes(1)
      expect(mockModel.update).toHaveBeenCalledWith({
        where: { id: 'tcr-b' },
        data: { kickoffSentAt: expect.any(Date) },
      })
    })

    it('is a no-op when no stranded records are found', async () => {
      mockModel.findMany.mockResolvedValueOnce([])

      await sweep(service)

      expect(mockQueue.sendMessage).not.toHaveBeenCalled()
      expect(mockModel.update).not.toHaveBeenCalled()
    })
  })
})
