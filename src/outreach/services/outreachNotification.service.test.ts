import { Test, TestingModule } from '@nestjs/testing'
import { Campaign, OutreachType, User, VoterFileFilter } from '@prisma/client'
import { PinoLogger } from 'nestjs-pino'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CampaignsService } from 'src/campaigns/services/campaigns.service'
import { CrmCampaignsService } from 'src/campaigns/services/crmCampaigns.service'
import { SlackService } from 'src/vendors/slack/services/slack.service'
import { SlackChannel } from 'src/vendors/slack/slackService.types'
import { VoterFileFilterService } from 'src/voters/services/voterFileFilter.service'
import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import { OutreachWithVoterFileFilter } from '../types/outreach.types'
import {
  OutreachNotificationService,
  shouldNotifyCAS,
} from './outreachNotification.service'

const mockSlackMessage = vi.fn()
const mockCampaignsUpdate = vi.fn()
const mockGetCrmCompanyOwnerName = vi.fn()
const mockVoterFileFilterToAudience = vi.fn()

const mockUser = {
  id: 1,
  email: 'jane@example.com',
  firstName: 'Jane',
  lastName: 'Doe',
  phone: null,
} as unknown as User

const baseCampaign = {
  id: 1,
  slug: 'jane-doe',
  aiContent: {},
  data: { hubspotId: 'hub-1' },
} as unknown as Campaign

const baseOutreach = {
  id: 10,
  outreachType: OutreachType.p2p,
  date: new Date('2026-06-01'),
  script: 'Vote for me. Reply STOP to opt-out.',
  imageUrl: 'https://cdn.example.com/img.png',
  message: '',
  projectId: 'peerly-job-123',
  voterFileFilter: { id: 1 } as unknown as VoterFileFilter,
} as unknown as OutreachWithVoterFileFilter

describe('shouldNotifyCAS', () => {
  it('returns false for undefined', () => {
    expect(shouldNotifyCAS(undefined)).toBe(false)
  })

  it('returns false for non-notifiable types', () => {
    expect(shouldNotifyCAS('doorKnocking')).toBe(false)
    expect(shouldNotifyCAS('phoneBanking')).toBe(false)
    expect(shouldNotifyCAS('socialMedia')).toBe(false)
    expect(shouldNotifyCAS('email')).toBe(false)
  })

  it('returns true for p2p, text, and robocall', () => {
    expect(shouldNotifyCAS(OutreachType.p2p)).toBe(true)
    expect(shouldNotifyCAS(OutreachType.text)).toBe(true)
    expect(shouldNotifyCAS(OutreachType.robocall)).toBe(true)
  })
})

describe('OutreachNotificationService', () => {
  let service: OutreachNotificationService

  beforeEach(async () => {
    mockSlackMessage.mockReset().mockResolvedValue('ok')
    mockCampaignsUpdate.mockReset().mockResolvedValue({})
    mockGetCrmCompanyOwnerName.mockReset().mockResolvedValue('Test PA')
    mockVoterFileFilterToAudience.mockReset().mockResolvedValue({})

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: PinoLogger, useValue: createMockLogger() },
        { provide: SlackService, useValue: { message: mockSlackMessage } },
        {
          provide: CampaignsService,
          useValue: { update: mockCampaignsUpdate },
        },
        {
          provide: CrmCampaignsService,
          useValue: { getCrmCompanyOwnerName: mockGetCrmCompanyOwnerName },
        },
        {
          provide: VoterFileFilterService,
          useValue: {
            voterFileFilterToAudience: mockVoterFileFilterToAudience,
          },
        },
        OutreachNotificationService,
      ],
    }).compile()

    service = module.get(OutreachNotificationService)
  })

  describe('notifySuccess', () => {
    it('skips when outreachType is non-notifiable', async () => {
      await service.notifySuccess({
        user: mockUser,
        campaign: baseCampaign,
        outreach: {
          ...baseOutreach,
          outreachType: 'doorKnocking' as OutreachType,
        },
      })

      expect(mockSlackMessage).not.toHaveBeenCalled()
      expect(mockCampaignsUpdate).not.toHaveBeenCalled()
    })

    it('handles null voterFileFilter without crashing', async () => {
      await service.notifySuccess({
        user: mockUser,
        campaign: baseCampaign,
        outreach: {
          ...baseOutreach,
          voterFileFilter: null,
        } as unknown as OutreachWithVoterFileFilter,
      })

      expect(mockVoterFileFilterToAudience).not.toHaveBeenCalled()
      expect(mockSlackMessage).toHaveBeenCalledTimes(1)
      expect(mockCampaignsUpdate).toHaveBeenCalledTimes(1)
    })

    it('includes peerlyJobUrl when projectId is set', async () => {
      await service.notifySuccess({
        user: mockUser,
        campaign: baseCampaign,
        outreach: baseOutreach,
      })

      const [blocks] = mockSlackMessage.mock.calls[0]
      expect(JSON.stringify(blocks)).toContain('peerly.com')
    })

    it('omits peerlyJobUrl when projectId is null', async () => {
      await service.notifySuccess({
        user: mockUser,
        campaign: baseCampaign,
        outreach: { ...baseOutreach, projectId: null },
      })

      const [blocks] = mockSlackMessage.mock.calls[0]
      expect(JSON.stringify(blocks)).not.toContain('peerly.com')
    })

    it('looks up assignedPa when hubspotId is present', async () => {
      await service.notifySuccess({
        user: mockUser,
        campaign: baseCampaign,
        outreach: baseOutreach,
      })

      expect(mockGetCrmCompanyOwnerName).toHaveBeenCalledWith('hub-1')
    })

    it('skips assignedPa lookup when hubspotId is missing', async () => {
      await service.notifySuccess({
        user: mockUser,
        campaign: { ...baseCampaign, data: {} } as unknown as Campaign,
        outreach: baseOutreach,
      })

      expect(mockGetCrmCompanyOwnerName).not.toHaveBeenCalled()
    })

    it('increments textCampaignCount via campaignsService.update', async () => {
      await service.notifySuccess({
        user: mockUser,
        campaign: {
          ...baseCampaign,
          data: { hubspotId: 'hub-1', textCampaignCount: 4 },
        } as unknown as Campaign,
        outreach: baseOutreach,
      })

      expect(mockCampaignsUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: baseCampaign.id },
          data: expect.objectContaining({
            data: expect.objectContaining({ textCampaignCount: 5 }),
          }),
        }),
      )
    })

    it('does not throw when campaignsService.update fails (logs and continues)', async () => {
      mockCampaignsUpdate.mockRejectedValueOnce(new Error('db down'))

      await expect(
        service.notifySuccess({
          user: mockUser,
          campaign: baseCampaign,
          outreach: baseOutreach,
        }),
      ).resolves.toBeUndefined()

      expect(mockSlackMessage).toHaveBeenCalledTimes(1)
    })

    it('still increments the counter when Slack message fails', async () => {
      mockSlackMessage.mockRejectedValueOnce(new Error('slack 5xx'))

      await expect(
        service.notifySuccess({
          user: mockUser,
          campaign: baseCampaign,
          outreach: baseOutreach,
        }),
      ).resolves.toBeUndefined()

      expect(mockSlackMessage).toHaveBeenCalledTimes(1)
      expect(mockCampaignsUpdate).toHaveBeenCalledTimes(1)
    })
  })

  describe('notifyFailure', () => {
    it('skips when outreachType is non-notifiable', async () => {
      await service.notifyFailure({
        user: mockUser,
        campaign: baseCampaign,
        createOutreachDto: { outreachType: 'doorKnocking' as OutreachType },
        step: 'validation',
        error: new Error('boom'),
      })

      expect(mockSlackMessage).not.toHaveBeenCalled()
    })

    it('skips when outreachType is undefined', async () => {
      await service.notifyFailure({
        user: mockUser,
        campaign: baseCampaign,
        createOutreachDto: {},
        step: 'validation',
        error: new Error('boom'),
      })

      expect(mockSlackMessage).not.toHaveBeenCalled()
    })

    it('fires when outreachType is notifiable', async () => {
      await service.notifyFailure({
        user: mockUser,
        campaign: baseCampaign,
        createOutreachDto: { outreachType: OutreachType.p2p },
        step: 'tcrLookup',
        error: new Error('TCR not found'),
      })

      expect(mockSlackMessage).toHaveBeenCalledTimes(1)
      const [blocks, channel] = mockSlackMessage.mock.calls[0]
      const blob = JSON.stringify(blocks)
      expect(blob).toContain('FAILED')
      expect(blob).toContain('tcrLookup')
      expect(blob).toContain('TCR not found')
      expect([SlackChannel.botPolitics, SlackChannel.botDev]).toContain(channel)
    })

    it('handles undefined campaign', async () => {
      await service.notifyFailure({
        user: mockUser,
        campaign: undefined,
        createOutreachDto: { outreachType: OutreachType.p2p },
        step: 'validation',
        error: new Error('bad input'),
      })

      const [blocks] = mockSlackMessage.mock.calls[0]
      expect(JSON.stringify(blocks)).toContain('unknown')
    })

    it('truncates error messages longer than 500 chars', async () => {
      const longMessage = 'x'.repeat(800)
      await service.notifyFailure({
        user: mockUser,
        campaign: baseCampaign,
        createOutreachDto: { outreachType: OutreachType.p2p },
        step: 'peerlyJobCreation',
        error: new Error(longMessage),
      })

      const [blocks] = mockSlackMessage.mock.calls[0]
      const blob = JSON.stringify(blocks)
      expect(blob).toContain('x'.repeat(500))
      expect(blob).not.toContain('x'.repeat(501))
    })

    it('shows "None" when script is missing', async () => {
      await service.notifyFailure({
        user: mockUser,
        campaign: baseCampaign,
        createOutreachDto: { outreachType: OutreachType.p2p },
        step: 'validation',
        error: new Error('boom'),
      })

      const [blocks] = mockSlackMessage.mock.calls[0]
      expect(JSON.stringify(blocks)).toContain('None')
    })

    it('truncates script preview at 200 chars', async () => {
      const longScript = 'a'.repeat(500)
      await service.notifyFailure({
        user: mockUser,
        campaign: baseCampaign,
        createOutreachDto: {
          outreachType: OutreachType.p2p,
          script: longScript,
        },
        step: 'validation',
        error: new Error('boom'),
      })

      const [blocks] = mockSlackMessage.mock.calls[0]
      const blob = JSON.stringify(blocks)
      expect(blob).toContain('a'.repeat(200))
      expect(blob).not.toContain('a'.repeat(201))
    })

    it('shows "Not provided" for missing date', async () => {
      await service.notifyFailure({
        user: mockUser,
        campaign: baseCampaign,
        createOutreachDto: { outreachType: OutreachType.p2p },
        step: 'validation',
        error: new Error('boom'),
      })

      const [blocks] = mockSlackMessage.mock.calls[0]
      expect(JSON.stringify(blocks)).toContain('Not provided')
    })
  })
})
