import { Test, TestingModule } from '@nestjs/testing'
import { BadGatewayException, BadRequestException } from '@nestjs/common'
import {
  CommitteeType,
  ExperimentRunStatus,
  OfficeLevel,
  TcrComplianceStatus,
} from '@prisma/client'
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'
import { PinoLogger } from 'nestjs-pino'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CampaignTcrComplianceService } from './campaignTcrCompliance.service'
import { ComplianceStateService } from './complianceState.service'
import { PeerlyIdentityService } from '../../../vendors/peerly/services/peerlyIdentity.service'
import { WebsitesService } from '../../../websites/services/websites.service'
import { CampaignsService } from '../../services/campaigns.service'
import { CrmCampaignsService } from '../../services/crmCampaigns.service'
import { QueueProducerService } from '../../../queue/producer/queueProducer.service'
import { ExperimentRunsService } from '../../../agentExperiments/services/experimentRuns.service'
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
  let mockCampaigns: {
    updateJsonFields: ReturnType<typeof vi.fn>
    findUnique: ReturnType<typeof vi.fn>
  }
  let mockCrm: { trackCampaign: ReturnType<typeof vi.fn> }
  let mockComplianceState: {
    findStateForCampaign: ReturnType<typeof vi.fn>
  }
  let mockQueue: { sendMessage: ReturnType<typeof vi.fn> }
  let mockExperimentRuns: {
    findFirst: ReturnType<typeof vi.fn>
    dispatchRun: ReturnType<typeof vi.fn>
  }
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
      findUnique: vi.fn().mockResolvedValue(campaign),
    }
    mockCrm = { trackCampaign: vi.fn().mockResolvedValue(undefined) }
    mockComplianceState = { findStateForCampaign: vi.fn() }
    mockQueue = { sendMessage: vi.fn().mockResolvedValue(undefined) }
    mockExperimentRuns = {
      findFirst: vi.fn().mockResolvedValue(null),
      dispatchRun: vi.fn().mockResolvedValue(undefined),
    }
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
        { provide: ComplianceStateService, useValue: mockComplianceState },
        { provide: QueueProducerService, useValue: mockQueue },
        { provide: ExperimentRunsService, useValue: mockExperimentRuns },
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
    expect(result).toEqual({
      record: expect.objectContaining({ id: 'tcr-new' }),
      created: true,
    })
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

    expect(result).toEqual({ record: existing, created: false })
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

    expect(result).toEqual({ record: raced, created: false })
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

describe('CampaignTcrComplianceService - handleAgenticKickoff', () => {
  let service: CampaignTcrComplianceService
  let mockCampaigns: { findUnique: ReturnType<typeof vi.fn> }
  let mockExperimentRuns: {
    findUnique: ReturnType<typeof vi.fn>
    dispatchRun: ReturnType<typeof vi.fn>
  }
  let mockModel: {
    findUnique: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    updateMany: ReturnType<typeof vi.fn>
  }
  let mockPrisma: { tcrCompliance: typeof mockModel }

  const kickoff = {
    campaignId: 123,
    tcrComplianceId: 'tcr-abc',
    clerkUserId: 'user_clerk_abc',
  }
  const tcrRecord = {
    id: kickoff.tcrComplianceId,
    campaignId: kickoff.campaignId,
    agenticRunId: null,
    agenticDispatchAttemptedAt: null,
  }
  const campaignUser = createMockUser({
    firstName: 'Jane',
    lastName: 'Doe',
    clerkId: kickoff.clerkUserId,
  })
  const campaign = {
    ...createMockCampaign({
      id: kickoff.campaignId,
      userId: campaignUser.id,
      organizationSlug: 'org-jane-for-springfield',
      details: { electionDate: '2027-11-02' },
    }),
    user: campaignUser,
  }

  const dispatchedRun = { runId: 'run-dispatched-xyz' }

  beforeEach(async () => {
    mockCampaigns = { findUnique: vi.fn().mockResolvedValue(campaign) }
    mockExperimentRuns = {
      findUnique: vi.fn().mockResolvedValue(null),
      dispatchRun: vi.fn().mockResolvedValue(dispatchedRun),
    }
    mockModel = {
      findUnique: vi.fn().mockResolvedValue(tcrRecord),
      update: vi.fn().mockResolvedValue(tcrRecord),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    }
    mockPrisma = { tcrCompliance: mockModel }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PeerlyIdentityService, useValue: {} },
        { provide: WebsitesService, useValue: {} },
        { provide: CampaignsService, useValue: mockCampaigns },
        { provide: CrmCampaignsService, useValue: {} },
        { provide: ComplianceStateService, useValue: {} },
        { provide: QueueProducerService, useValue: { sendMessage: vi.fn() } },
        { provide: ExperimentRunsService, useValue: mockExperimentRuns },
        { provide: PinoLogger, useValue: createMockLogger() },
        CampaignTcrComplianceService,
      ],
    }).compile()

    service = module.get(CampaignTcrComplianceService)

    vi.clearAllMocks()
    mockCampaigns.findUnique.mockResolvedValue(campaign)
    mockExperimentRuns.findUnique.mockResolvedValue(null)
    mockExperimentRuns.dispatchRun.mockResolvedValue(dispatchedRun)
    mockModel.findUnique.mockResolvedValue(tcrRecord)
    mockModel.update.mockResolvedValue(tcrRecord)
    mockModel.updateMany.mockResolvedValue({ count: 1 })
  })

  it('claims the dispatch slot atomically before calling dispatchRun', async () => {
    await service.handleAgenticKickoff(kickoff)

    const claimCall = mockModel.updateMany.mock.calls[0][0]
    expect(claimCall.where).toMatchObject({
      id: kickoff.tcrComplianceId,
      agenticRunId: null,
      OR: [
        { agenticDispatchAttemptedAt: null },
        { agenticDispatchAttemptedAt: { lt: expect.any(Date) } },
      ],
    })
    expect(claimCall.data.agenticDispatchAttemptedAt).toBeInstanceOf(Date)

    const dispatchCallOrder =
      mockExperimentRuns.dispatchRun.mock.invocationCallOrder[0]
    const claimCallOrder = mockModel.updateMany.mock.invocationCallOrder[0]
    expect(claimCallOrder).toBeLessThan(dispatchCallOrder)
  })

  it('dispatches a compliance_setup run with manifest-shaped params', async () => {
    await service.handleAgenticKickoff(kickoff)

    expect(mockExperimentRuns.dispatchRun).toHaveBeenCalledWith({
      type: 'compliance_setup',
      organizationSlug: campaign.organizationSlug,
      clerkUserId: kickoff.clerkUserId,
      params: {
        campaign_id: kickoff.campaignId,
        candidate_first_name: 'Jane',
        candidate_last_name: 'Doe',
        clerk_user_id: kickoff.clerkUserId,
        election_date: '2027-11-02',
        trigger: 'initial',
      },
    })
  })

  it('stamps agenticRunId on the record after a successful dispatch', async () => {
    await service.handleAgenticKickoff(kickoff)

    expect(mockModel.update).toHaveBeenCalledWith({
      where: { id: kickoff.tcrComplianceId },
      data: { agenticRunId: dispatchedRun.runId },
    })
  })

  it('passes empty strings when candidate first/last name are null', async () => {
    mockCampaigns.findUnique.mockResolvedValueOnce({
      ...campaign,
      user: { ...campaignUser, firstName: null, lastName: null },
    })

    await service.handleAgenticKickoff(kickoff)

    const dispatchArg = mockExperimentRuns.dispatchRun.mock.calls[0][0]
    expect(dispatchArg.params.candidate_first_name).toBe('')
    expect(dispatchArg.params.candidate_last_name).toBe('')
  })

  it('does not include actor_token_url in the dispatch params', async () => {
    await service.handleAgenticKickoff(kickoff)

    const dispatchCall = mockExperimentRuns.dispatchRun.mock.calls[0][0]
    expect(JSON.stringify(dispatchCall)).not.toContain('actor_token_url')
    expect(JSON.stringify(dispatchCall)).not.toContain('actorTokenUrl')
  })

  it.each([ExperimentRunStatus.RUNNING, ExperimentRunStatus.COMPLETED])(
    'skips dispatch when claim fails and existing run is %s',
    async (status) => {
      const recordWithRun = {
        ...tcrRecord,
        agenticRunId: 'run-existing',
      }
      mockModel.updateMany.mockResolvedValueOnce({ count: 0 })
      mockModel.findUnique
        .mockResolvedValueOnce(recordWithRun)
        .mockResolvedValueOnce(recordWithRun)
      mockExperimentRuns.findUnique.mockResolvedValueOnce({
        runId: 'run-existing',
        status,
      })

      await service.handleAgenticKickoff(kickoff)

      expect(mockExperimentRuns.dispatchRun).not.toHaveBeenCalled()
    },
  )

  it('re-dispatches when claim fails and existing run is FAILED', async () => {
    const recordWithRun = {
      ...tcrRecord,
      agenticRunId: 'run-failed',
    }
    mockModel.updateMany
      .mockResolvedValueOnce({ count: 0 }) // initial claim
      .mockResolvedValueOnce({ count: 1 }) // FAILED retake
    mockModel.findUnique
      .mockResolvedValueOnce(recordWithRun)
      .mockResolvedValueOnce(recordWithRun)
    mockExperimentRuns.findUnique.mockResolvedValueOnce({
      runId: 'run-failed',
      status: ExperimentRunStatus.FAILED,
    })

    await service.handleAgenticKickoff(kickoff)

    expect(mockExperimentRuns.dispatchRun).toHaveBeenCalledTimes(1)
    const retakeCall = mockModel.updateMany.mock.calls[1][0]
    expect(retakeCall.where).toMatchObject({
      id: kickoff.tcrComplianceId,
      agenticRunId: 'run-failed',
    })
    expect(retakeCall.data).toMatchObject({ agenticRunId: null })
  })

  it('skips when claim fails and the FAILED retake loses the race', async () => {
    const recordWithRun = {
      ...tcrRecord,
      agenticRunId: 'run-failed',
    }
    mockModel.updateMany
      .mockResolvedValueOnce({ count: 0 }) // initial claim
      .mockResolvedValueOnce({ count: 0 }) // FAILED retake lost
    mockModel.findUnique
      .mockResolvedValueOnce(recordWithRun)
      .mockResolvedValueOnce(recordWithRun)
    mockExperimentRuns.findUnique.mockResolvedValueOnce({
      runId: 'run-failed',
      status: ExperimentRunStatus.FAILED,
    })

    await service.handleAgenticKickoff(kickoff)

    expect(mockExperimentRuns.dispatchRun).not.toHaveBeenCalled()
  })

  it('skips when claim fails, agenticRunId is set, but no experiment_run row is found', async () => {
    const recordWithRun = {
      ...tcrRecord,
      agenticRunId: 'run-orphan',
    }
    mockModel.updateMany.mockResolvedValueOnce({ count: 0 })
    mockModel.findUnique
      .mockResolvedValueOnce(recordWithRun)
      .mockResolvedValueOnce(recordWithRun)
    mockExperimentRuns.findUnique.mockResolvedValueOnce(null)

    await service.handleAgenticKickoff(kickoff)

    expect(mockExperimentRuns.dispatchRun).not.toHaveBeenCalled()
  })

  it('skips when claim fails because another worker holds an in-flight claim', async () => {
    mockModel.updateMany.mockResolvedValueOnce({ count: 0 })
    mockModel.findUnique.mockResolvedValueOnce({
      ...tcrRecord,
      agenticRunId: null,
      agenticDispatchAttemptedAt: new Date(),
    })

    await service.handleAgenticKickoff(kickoff)

    expect(mockExperimentRuns.dispatchRun).not.toHaveBeenCalled()
    expect(mockExperimentRuns.findUnique).not.toHaveBeenCalled()
  })

  it('marks the record as error and skips dispatch when electionDate is missing', async () => {
    mockCampaigns.findUnique.mockResolvedValueOnce({
      ...campaign,
      details: {},
    })

    await service.handleAgenticKickoff(kickoff)

    expect(mockExperimentRuns.dispatchRun).not.toHaveBeenCalled()
    expect(mockModel.update).toHaveBeenCalledWith({
      where: { id: kickoff.tcrComplianceId },
      data: { status: TcrComplianceStatus.error },
    })
    expect(mockModel.updateMany).not.toHaveBeenCalled()
  })

  it('drops silently when the TcrCompliance record does not exist', async () => {
    mockModel.findUnique.mockResolvedValueOnce(null)

    await service.handleAgenticKickoff(kickoff)

    expect(mockExperimentRuns.dispatchRun).not.toHaveBeenCalled()
    expect(mockModel.updateMany).not.toHaveBeenCalled()
  })

  it('drops silently when the record belongs to a different campaign', async () => {
    mockModel.findUnique.mockResolvedValueOnce({
      ...tcrRecord,
      campaignId: tcrRecord.campaignId + 1,
    })

    await service.handleAgenticKickoff(kickoff)

    expect(mockExperimentRuns.dispatchRun).not.toHaveBeenCalled()
  })

  it('drops silently when the campaign does not exist', async () => {
    mockCampaigns.findUnique.mockResolvedValueOnce(null)

    await service.handleAgenticKickoff(kickoff)

    expect(mockExperimentRuns.dispatchRun).not.toHaveBeenCalled()
  })

  it('drops silently when the campaign has no user', async () => {
    mockCampaigns.findUnique.mockResolvedValueOnce({
      ...campaign,
      user: null,
    })

    await service.handleAgenticKickoff(kickoff)

    expect(mockExperimentRuns.dispatchRun).not.toHaveBeenCalled()
  })

  it('rolls back the claim scoped to its timestamp on dispatchRun throw', async () => {
    const err = new BadGatewayException('SQS dispatch failed')
    mockExperimentRuns.dispatchRun.mockRejectedValueOnce(err)

    await expect(service.handleAgenticKickoff(kickoff)).rejects.toBe(err)

    const claimTimestamp =
      mockModel.updateMany.mock.calls[0][0].data.agenticDispatchAttemptedAt
    expect(mockModel.updateMany).toHaveBeenLastCalledWith({
      where: {
        id: kickoff.tcrComplianceId,
        agenticRunId: null,
        agenticDispatchAttemptedAt: claimTimestamp,
      },
      data: { agenticDispatchAttemptedAt: null },
    })
    expect(mockModel.update).not.toHaveBeenCalled()
  })

  it('rolls back the claim and acks when dispatchRun returns no run', async () => {
    mockExperimentRuns.dispatchRun.mockResolvedValueOnce(undefined)

    await expect(service.handleAgenticKickoff(kickoff)).resolves.toBeUndefined()

    const claimTimestamp =
      mockModel.updateMany.mock.calls[0][0].data.agenticDispatchAttemptedAt
    expect(mockModel.updateMany).toHaveBeenLastCalledWith({
      where: {
        id: kickoff.tcrComplianceId,
        agenticRunId: null,
        agenticDispatchAttemptedAt: claimTimestamp,
      },
      data: { agenticDispatchAttemptedAt: null },
    })
    expect(mockModel.update).not.toHaveBeenCalled()
  })
})

describe('CampaignTcrComplianceService - submitToPeerlyForAgent', () => {
  let service: CampaignTcrComplianceService
  let mockPeerly: {
    getTCRIdentityName: ReturnType<typeof vi.fn>
    getIdentities: ReturnType<typeof vi.fn>
    createIdentity: ReturnType<typeof vi.fn>
    getIdentityProfile: ReturnType<typeof vi.fn>
    submitIdentityProfile: ReturnType<typeof vi.fn>
    submit10DlcBrand: ReturnType<typeof vi.fn>
    getCampaignVerifyRequest: ReturnType<typeof vi.fn>
    submitCampaignVerifyRequest: ReturnType<typeof vi.fn>
  }
  let mockComplianceState: {
    findStateForCampaign: ReturnType<typeof vi.fn>
  }
  let mockTcrModel: {
    findUnique: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    updateMany: ReturnType<typeof vi.fn>
  }
  let mockPrisma: {
    tcrCompliance: typeof mockTcrModel
    $transaction: ReturnType<typeof vi.fn>
  }

  const user = createMockUser({ clerkId: 'user_clerk_xyz' })
  const campaign = createMockCampaign({
    userId: user.id,
    formattedAddress: '123 Main St',
    placeId: 'place-123',
    details: { electionDate: '2026-11-03' },
  })

  const input = {
    ein: '12-3456789',
    committeeName: 'Jane for Springfield',
    filingUrl: 'https://example.gov/filing/123',
    email: 'jane@example.com',
    phone: '5555555555',
    officeLevel: OfficeLevel.state,
    fecCommitteeId: undefined,
    committeeType: CommitteeType.CANDIDATE,
    websiteUrl: 'https://janedoe.com',
  }

  const existingRecord = {
    id: 'tcr-existing',
    campaignId: campaign.id,
    ein: '00-0000000',
    committeeName: 'Stub Committee',
    websiteDomain: '',
    filingUrl: 'https://stub.gov/filing',
    phone: '0000000000',
    email: 'stub@example.com',
    officeLevel: OfficeLevel.state,
    fecCommitteeId: null,
    committeeType: CommitteeType.CANDIDATE,
    status: TcrComplianceStatus.submitted,
    peerlyIdentityId: null,
    peerlyIdentityProfileLink: null,
    peerly10DLCBrandSubmissionKey: null,
    peerlyCvVerificationId: null,
    postalAddress: '123 Main St',
    kickoffSentAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    tdlcNumber: null,
    peerlyRegistrationLink: null,
  }

  beforeEach(async () => {
    mockPeerly = {
      getTCRIdentityName: vi.fn().mockReturnValue('Jane Doe - 12-3456789'),
      getIdentities: vi.fn().mockResolvedValue([]),
      createIdentity: vi.fn().mockResolvedValue({ identity_id: 'peerly-id-1' }),
      getIdentityProfile: vi.fn().mockResolvedValue(null),
      submitIdentityProfile: vi
        .fn()
        .mockResolvedValue({ link: 'https://peerly/profile/1', profile: {} }),
      submit10DlcBrand: vi.fn().mockResolvedValue('brand-key-1'),
      getCampaignVerifyRequest: vi.fn().mockResolvedValue(null),
      submitCampaignVerifyRequest: vi
        .fn()
        .mockResolvedValue({ verification_id: 'cv-verif-1', message: 'ok' }),
    }
    mockComplianceState = {
      findStateForCampaign: vi.fn().mockResolvedValue({
        stage: 'awaiting_pin',
        domain: null,
        websiteId: null,
        peerlyVerificationId: null,
      }),
    }
    mockTcrModel = {
      findUnique: vi.fn().mockResolvedValue(existingRecord),
      update: vi.fn().mockImplementation(({ where, data }) =>
        Promise.resolve({
          ...existingRecord,
          ...data,
          id: where.id,
        }),
      ),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    }
    mockPrisma = {
      tcrCompliance: mockTcrModel,
      $transaction: vi.fn(),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PeerlyIdentityService, useValue: mockPeerly },
        {
          provide: WebsitesService,
          useValue: { findFirstOrThrow: vi.fn() },
        },
        {
          provide: CampaignsService,
          useValue: { updateJsonFields: vi.fn() },
        },
        {
          provide: CrmCampaignsService,
          useValue: { trackCampaign: vi.fn() },
        },
        { provide: ComplianceStateService, useValue: mockComplianceState },
        {
          provide: QueueProducerService,
          useValue: { sendMessage: vi.fn() },
        },
        {
          provide: ExperimentRunsService,
          useValue: { findFirst: vi.fn(), dispatchRun: vi.fn() },
        },
        { provide: PinoLogger, useValue: createMockLogger() },
        CampaignTcrComplianceService,
      ],
    }).compile()

    service = module.get(CampaignTcrComplianceService)
  })

  it('throws NotFoundException when no TcrCompliance exists', async () => {
    mockTcrModel.findUnique.mockResolvedValueOnce(null)

    await expect(
      service.submitToPeerlyForAgent(user, campaign, input),
    ).rejects.toThrow(
      `TcrCompliance record not found for campaignId=${campaign.id}`,
    )

    expect(mockPeerly.getIdentities).not.toHaveBeenCalled()
  })

  it('is idempotent: returns existing record without calling Peerly when peerlyIdentityId is set', async () => {
    mockTcrModel.findUnique.mockResolvedValueOnce({
      ...existingRecord,
      peerlyIdentityId: 'peerly-already-set',
      peerlyIdentityProfileLink: 'https://peerly/profile/existing',
      peerly10DLCBrandSubmissionKey: 'brand-existing',
      peerlyCvVerificationId: 'cv-existing',
    })

    const result = await service.submitToPeerlyForAgent(user, campaign, input)

    expect(mockPeerly.getIdentities).not.toHaveBeenCalled()
    expect(mockPeerly.createIdentity).not.toHaveBeenCalled()
    expect(mockPeerly.submit10DlcBrand).not.toHaveBeenCalled()
    expect(mockPeerly.submitCampaignVerifyRequest).not.toHaveBeenCalled()
    expect(mockTcrModel.updateMany).not.toHaveBeenCalled()

    expect(result).toEqual({
      tcrComplianceId: existingRecord.id,
      peerlyIdentityId: 'peerly-already-set',
      peerlyIdentityProfileLink: 'https://peerly/profile/existing',
      peerly10DLCBrandSubmissionKey: 'brand-existing',
      peerlyVerificationId: 'cv-existing',
      stage: 'awaiting_pin',
      // Channels come from the persisted record, not the request input, so a
      // retry with different contact details cannot misreport where Peerly
      // sent the PIN.
      pinDeliveryChannels: {
        email: existingRecord.email,
        phone: existingRecord.phone,
      },
    })
  })

  it('canonicalizes the input URL to the apex hostname (strips www., scheme, and path) for both Peerly fields and the DB', async () => {
    await service.submitToPeerlyForAgent(user, campaign, {
      ...input,
      websiteUrl: 'https://www.janedoe.com/path?q=1',
    })

    expect(mockPeerly.submit10DlcBrand).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ websiteDomain: 'janedoe.com' }),
      campaign,
      'janedoe.com',
    )
    expect(mockPeerly.submitCampaignVerifyRequest).toHaveBeenCalledWith(
      expect.any(Object),
      user,
      campaign,
      'janedoe.com',
    )
    expect(mockTcrModel.update).toHaveBeenCalledWith({
      where: { id: existingRecord.id },
      data: expect.objectContaining({ websiteDomain: 'janedoe.com' }),
    })
  })

  it('claims the submission slot atomically before calling Peerly', async () => {
    await service.submitToPeerlyForAgent(user, campaign, input)

    const firstUpdateMany = mockTcrModel.updateMany.mock.calls[0]
    expect(firstUpdateMany[0]).toEqual({
      where: {
        id: existingRecord.id,
        peerlyIdentityId: null,
        OR: [
          { peerlySubmissionStartedAt: null },
          { peerlySubmissionStartedAt: { lt: expect.any(Date) } },
        ],
      },
      data: { peerlySubmissionStartedAt: expect.any(Date) },
    })
    // Claim happens BEFORE Peerly is invoked
    const claimCallOrder = mockTcrModel.updateMany.mock.invocationCallOrder[0]
    const peerlyCallOrder = mockPeerly.getIdentities.mock.invocationCallOrder[0]
    expect(claimCallOrder).toBeLessThan(peerlyCallOrder)
  })

  it('submits to Peerly, persists results (including peerlyCvVerificationId), and returns awaiting_pin on the happy path', async () => {
    const result = await service.submitToPeerlyForAgent(user, campaign, input)

    expect(mockPeerly.submit10DlcBrand).toHaveBeenCalledWith(
      'peerly-id-1',
      expect.objectContaining({ websiteDomain: 'janedoe.com' }),
      campaign,
      'janedoe.com',
    )
    expect(mockPeerly.submitCampaignVerifyRequest).toHaveBeenCalledWith(
      expect.objectContaining({ peerlyIdentityId: 'peerly-id-1' }),
      user,
      campaign,
      'janedoe.com',
    )

    expect(mockTcrModel.update).toHaveBeenCalledWith({
      where: { id: existingRecord.id },
      data: expect.objectContaining({
        peerlyIdentityId: 'peerly-id-1',
        peerlyIdentityProfileLink: 'https://peerly/profile/1',
        peerly10DLCBrandSubmissionKey: 'brand-key-1',
        peerlyCvVerificationId: 'cv-verif-1',
        websiteDomain: 'janedoe.com',
        email: input.email,
        phone: input.phone,
      }),
    })

    expect(result).toEqual({
      tcrComplianceId: existingRecord.id,
      peerlyIdentityId: 'peerly-id-1',
      peerlyIdentityProfileLink: 'https://peerly/profile/1',
      peerly10DLCBrandSubmissionKey: 'brand-key-1',
      peerlyVerificationId: 'cv-verif-1',
      stage: 'awaiting_pin',
      pinDeliveryChannels: { email: input.email, phone: input.phone },
    })
  })

  it('throws ConflictException when claim is taken and the in-flight call has not yet persisted peerlyIdentityId', async () => {
    mockTcrModel.updateMany.mockResolvedValueOnce({ count: 0 })
    mockTcrModel.findUnique
      .mockResolvedValueOnce(existingRecord)
      .mockResolvedValueOnce(existingRecord)

    await expect(
      service.submitToPeerlyForAgent(user, campaign, input),
    ).rejects.toThrow('A Peerly submission is already in progress')

    expect(mockPeerly.getIdentities).not.toHaveBeenCalled()
  })

  it('returns idempotent response when claim is taken because a concurrent call already completed', async () => {
    mockTcrModel.updateMany.mockResolvedValueOnce({ count: 0 })
    const winner = {
      ...existingRecord,
      peerlyIdentityId: 'peerly-winner',
      peerlyIdentityProfileLink: 'https://peerly/profile/winner',
      peerly10DLCBrandSubmissionKey: 'brand-winner',
      peerlyCvVerificationId: 'cv-winner',
    }
    mockTcrModel.findUnique
      .mockResolvedValueOnce(existingRecord)
      .mockResolvedValueOnce(winner)

    const result = await service.submitToPeerlyForAgent(user, campaign, input)

    expect(mockPeerly.getIdentities).not.toHaveBeenCalled()
    expect(result).toEqual({
      tcrComplianceId: winner.id,
      peerlyIdentityId: 'peerly-winner',
      peerlyIdentityProfileLink: 'https://peerly/profile/winner',
      peerly10DLCBrandSubmissionKey: 'brand-winner',
      peerlyVerificationId: 'cv-winner',
      stage: 'awaiting_pin',
      pinDeliveryChannels: { email: winner.email, phone: winner.phone },
    })
  })

  it('rolls back only this callers own claim (matched by timestamp) and rethrows when Peerly fails', async () => {
    const peerlyErr = new BadGatewayException('Peerly down')
    mockPeerly.createIdentity.mockRejectedValueOnce(peerlyErr)

    await expect(
      service.submitToPeerlyForAgent(user, campaign, input),
    ).rejects.toBe(peerlyErr)

    // Two updateMany calls: claim, then rollback
    expect(mockTcrModel.updateMany).toHaveBeenCalledTimes(2)
    const claimCall = mockTcrModel.updateMany.mock.calls[0][0]
    const rollbackCall = mockTcrModel.updateMany.mock.calls[1][0]
    const claimTimestamp = claimCall.data.peerlySubmissionStartedAt
    expect(claimTimestamp).toBeInstanceOf(Date)
    // Rollback scopes to the exact timestamp we wrote, so a TTL re-claim by
    // another caller would NOT be cleared by our rollback.
    expect(rollbackCall).toEqual({
      where: {
        id: existingRecord.id,
        peerlyIdentityId: null,
        peerlySubmissionStartedAt: claimTimestamp,
      },
      data: { peerlySubmissionStartedAt: null },
    })
    // Final write never happens on the failure path
    expect(mockTcrModel.update).not.toHaveBeenCalled()
  })

  it('throws UnprocessableEntityException when compliance stage is not awaiting_pin (website not yet live)', async () => {
    mockComplianceState.findStateForCampaign.mockResolvedValueOnce({
      stage: 'pending_website_live',
      domain: null,
      websiteId: null,
      peerlyVerificationId: null,
    })

    await expect(
      service.submitToPeerlyForAgent(user, campaign, input),
    ).rejects.toThrow(
      'Cannot submit TCR registration to Peerly until the candidate',
    )

    expect(mockPeerly.getIdentities).not.toHaveBeenCalled()
    expect(mockTcrModel.updateMany).not.toHaveBeenCalled()
    expect(mockTcrModel.update).not.toHaveBeenCalled()
  })

  it('preserves persisted peerlyCvVerificationId when Peerly already has a CV request (existing-CV branch)', async () => {
    // Existing record carries a CV id from a prior partial run.
    const recordWithExistingCv = {
      ...existingRecord,
      peerlyCvVerificationId: 'cv-existing-from-prior-run',
    }
    mockTcrModel.findUnique.mockResolvedValueOnce(recordWithExistingCv)

    // Peerly's GET shows an existing CV request, so the helper skips submit
    // and returns null for cvVerificationId (the GET response shape carries
    // no verification_id).
    mockPeerly.getCampaignVerifyRequest.mockResolvedValueOnce({
      verification_status: 'pending',
    })

    const result = await service.submitToPeerlyForAgent(user, campaign, input)

    expect(mockPeerly.submitCampaignVerifyRequest).not.toHaveBeenCalled()
    expect(mockTcrModel.update).toHaveBeenCalledWith({
      where: { id: recordWithExistingCv.id },
      data: expect.objectContaining({
        peerlyCvVerificationId: 'cv-existing-from-prior-run',
      }),
    })
    expect(result.peerlyVerificationId).toBe('cv-existing-from-prior-run')
  })

  it('surfaces BadRequestException and rolls back claim when campaignCommittee is absent (real submit10DlcBrand guard)', async () => {
    // The real PeerlyIdentityService.submit10DlcBrand throws this when
    // campaign.details.campaignCommittee is missing. The rest of this suite
    // mocks the helper away; this test forces the real production-path error
    // so we exercise error propagation + claim rollback.
    const missingCommitteeErr = new BadRequestException(
      'Campaign committee is required to submit 10DLC brand',
    )
    mockPeerly.submit10DlcBrand.mockRejectedValueOnce(missingCommitteeErr)

    await expect(
      service.submitToPeerlyForAgent(user, campaign, input),
    ).rejects.toBe(missingCommitteeErr)

    // Two updateMany calls: claim, then rollback scoped to our own timestamp.
    expect(mockTcrModel.updateMany).toHaveBeenCalledTimes(2)
    const claimCall = mockTcrModel.updateMany.mock.calls[0][0]
    const rollbackCall = mockTcrModel.updateMany.mock.calls[1][0]
    expect(rollbackCall).toEqual({
      where: {
        id: existingRecord.id,
        peerlyIdentityId: null,
        peerlySubmissionStartedAt: claimCall.data.peerlySubmissionStartedAt,
      },
      data: { peerlySubmissionStartedAt: null },
    })
    // Final write never happens on the failure path.
    expect(mockTcrModel.update).not.toHaveBeenCalled()
  })
})
