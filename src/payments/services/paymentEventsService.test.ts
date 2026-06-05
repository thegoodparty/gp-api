import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import { Campaign, User } from '../../generated/prisma'
import Stripe from 'stripe'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EVENTS } from 'src/vendors/segment/segment.types'
import { CheckoutSessionMode, WebhookEventType } from '../payments.types'
import { PaymentEventsService } from './paymentEventsService'

describe('PaymentEventsService', () => {
  let service: PaymentEventsService
  const logger = createMockLogger()

  const usersService = {
    findUser: vi.fn(),
    patchUserMetaData: vi.fn(),
  }
  const campaignsService = {
    findByUserId: vi.fn(),
    patchCampaignDetails: vi.fn(),
    setIsPro: vi.fn(),
  }
  const analytics = {
    trackProPayment: vi.fn(),
    track: vi.fn(),
  }
  const slackService = { message: vi.fn() }
  const voterFileDownloadAccess = { downloadAccessAlert: vi.fn() }
  const organizationsService = {
    getDistrictForOrgSlug: vi.fn(),
    resolvePositionNameByOrganizationSlug: vi.fn(),
  }
  const crm = { getCrmCompanyOwnerName: vi.fn() }

  const mockUser = { id: 1, email: 'test@example.com' } as User
  const mockCampaign = {
    id: 111,
    organizationSlug: null,
    details: {
      electionDate: new Date(Date.now() + 365 * 86_400_000).toISOString(),
    },
    data: {},
  } as unknown as Campaign

  const subscriptionEvent = {
    type: WebhookEventType.CheckoutSessionCompleted,
    data: {
      object: {
        id: 'cs_test',
        mode: CheckoutSessionMode.SUBSCRIPTION,
        customer: 'cus_test',
        subscription: 'sub_test',
        metadata: { userId: '1' },
      },
    },
  } as unknown as Stripe.CheckoutSessionCompletedEvent

  beforeEach(() => {
    vi.clearAllMocks()
    usersService.findUser.mockResolvedValue(mockUser)
    usersService.patchUserMetaData.mockResolvedValue(undefined)
    campaignsService.findByUserId.mockResolvedValue(mockCampaign)
    campaignsService.patchCampaignDetails.mockResolvedValue(undefined)
    campaignsService.setIsPro.mockResolvedValue(undefined)
    analytics.trackProPayment.mockResolvedValue(undefined)
    analytics.track.mockResolvedValue(undefined)
    slackService.message.mockResolvedValue(undefined)
    voterFileDownloadAccess.downloadAccessAlert.mockResolvedValue(undefined)

    service = new PaymentEventsService(
      usersService as never,
      campaignsService as never,
      slackService as never,
      {} as never,
      crm as never,
      voterFileDownloadAccess as never,
      organizationsService as never,
      {} as never,
      analytics as never,
      {} as never,
      logger,
    )
  })

  describe('handleEvent — checkout.session.completed (subscription)', () => {
    it('fires pro_upgrade_complete with the correct user id and payload', async () => {
      await service.handleEvent(subscriptionEvent)

      expect(analytics.track).toHaveBeenCalledExactlyOnceWith(
        mockUser.id,
        EVENTS.Account.ProUpgradeComplete,
        { pro: true },
      )
      expect(usersService.patchUserMetaData).toHaveBeenCalled()
    })

    it('swallows analytics.track errors and continues the flow', async () => {
      const trackError = new Error('segment down')
      analytics.track.mockRejectedValueOnce(trackError)

      await expect(
        service.handleEvent(subscriptionEvent),
      ).resolves.not.toThrow()

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ error: trackError }),
        expect.stringContaining('pro_upgrade_complete'),
      )
      expect(usersService.patchUserMetaData).toHaveBeenCalled()
    })

    it('fires pro_upgrade_complete even when trackProPayment throws', async () => {
      analytics.trackProPayment.mockRejectedValueOnce(new Error('boom'))

      await service.handleEvent(subscriptionEvent)

      expect(analytics.track).toHaveBeenCalledWith(
        mockUser.id,
        EVENTS.Account.ProUpgradeComplete,
        { pro: true },
      )
    })
  })
})
