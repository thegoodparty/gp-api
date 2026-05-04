import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import {
  createMockCampaign,
  createMockUser,
} from '@/shared/test-utils/mockData.util'
import { Campaign, User } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AnalyticsService } from 'src/analytics/analytics.service'
import { CampaignsService } from '../../campaigns/services/campaigns.service'
import { CrmCampaignsService } from '../../campaigns/services/crmCampaigns.service'
import { EmailService } from '../../email/email.service'
import { OrganizationsService } from '../../organizations/services/organizations.service'
import { VoterFileDownloadAccessService } from '../../shared/services/voterFileDownloadAccess.service'
import { UsersService } from '../../users/services/users.service'
import { SlackService } from '../../vendors/slack/services/slack.service'
import { StripeService } from '../../vendors/stripe/services/stripe.service'
import { CheckoutSessionMode } from '../payments.types'
import { PaymentEventsService } from './paymentEventsService'
import type { PurchaseService } from './purchase.service'
import type Stripe from 'stripe'

const formatYmd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const futureIso = () => {
  const d = new Date()
  d.setFullYear(d.getFullYear() + 1)
  return formatYmd(d)
}
const pastIso = () => {
  const d = new Date()
  d.setFullYear(d.getFullYear() - 1)
  return formatYmd(d)
}

const buildSubscriptionSession = (
  overrides: Partial<Stripe.Checkout.Session> = {},
): Stripe.Checkout.Session =>
  ({
    id: 'cs_test_123',
    mode: CheckoutSessionMode.SUBSCRIPTION,
    customer: 'cus_test_abc',
    subscription: 'sub_test_xyz',
    payment_status: 'paid',
    metadata: { userId: '7' },
    ...overrides,
  }) as unknown as Stripe.Checkout.Session

describe('PaymentEventsService', () => {
  let service: PaymentEventsService
  let usersService: {
    findUser: ReturnType<typeof vi.fn>
    patchUserMetaData: ReturnType<typeof vi.fn>
  }
  let campaignsService: {
    findByUserId: ReturnType<typeof vi.fn>
    patchCampaignDetails: ReturnType<typeof vi.fn>
    setIsPro: ReturnType<typeof vi.fn>
  }
  let slackService: { message: ReturnType<typeof vi.fn> }
  let voterFileDownloadAccess: { downloadAccessAlert: ReturnType<typeof vi.fn> }
  let organizationsService: {
    getDistrictForOrgSlug: ReturnType<typeof vi.fn>
    resolvePositionNameByOrganizationSlug: ReturnType<typeof vi.fn>
  }
  let stripeService: { retrieveCheckoutSession: ReturnType<typeof vi.fn> }
  let analytics: { trackProPayment: ReturnType<typeof vi.fn> }
  let crm: { getCrmCompanyOwnerName: ReturnType<typeof vi.fn> }

  const mockUser: User = createMockUser({ id: 7, email: 'allie@example.com' })

  beforeEach(() => {
    usersService = {
      findUser: vi.fn().mockResolvedValue(mockUser),
      patchUserMetaData: vi.fn().mockResolvedValue(undefined),
    }
    campaignsService = {
      findByUserId: vi.fn(),
      patchCampaignDetails: vi.fn().mockResolvedValue(undefined),
      setIsPro: vi.fn().mockResolvedValue(undefined),
    }
    slackService = { message: vi.fn().mockResolvedValue(undefined) }
    voterFileDownloadAccess = {
      downloadAccessAlert: vi.fn().mockResolvedValue(undefined),
    }
    organizationsService = {
      getDistrictForOrgSlug: vi.fn().mockResolvedValue(null),
      resolvePositionNameByOrganizationSlug: vi.fn().mockResolvedValue(null),
    }
    stripeService = { retrieveCheckoutSession: vi.fn() }
    analytics = { trackProPayment: vi.fn().mockResolvedValue(undefined) }
    crm = { getCrmCompanyOwnerName: vi.fn().mockResolvedValue('PA Name') }

    service = new PaymentEventsService(
      usersService as unknown as UsersService,
      campaignsService as unknown as CampaignsService,
      slackService as unknown as SlackService,
      {} as EmailService,
      crm as unknown as CrmCampaignsService,
      voterFileDownloadAccess as unknown as VoterFileDownloadAccessService,
      organizationsService as unknown as OrganizationsService,
      stripeService as unknown as StripeService,
      analytics as unknown as AnalyticsService,
      {} as PurchaseService,
      createMockLogger(),
    )
  })

  describe('checkoutSessionCompletedHandler — subscription mode', () => {
    it('grants Pro and clears checkoutSessionId on the happy path', async () => {
      const campaign: Campaign = createMockCampaign({
        details: { electionDate: futureIso() },
      })
      campaignsService.findByUserId.mockResolvedValue(campaign)

      const event = {
        type: 'checkout.session.completed',
        data: { object: buildSubscriptionSession() },
      } as unknown as Stripe.CheckoutSessionCompletedEvent

      await service.checkoutSessionCompletedHandler(event)

      expect(campaignsService.patchCampaignDetails).toHaveBeenCalledWith(
        campaign.id,
        { subscriptionId: 'sub_test_xyz' },
      )
      expect(campaignsService.setIsPro).toHaveBeenCalledWith(campaign.id)
      expect(usersService.patchUserMetaData).toHaveBeenCalledWith(mockUser.id, {
        customerId: 'cus_test_abc',
        checkoutSessionId: null,
      })
      expect(voterFileDownloadAccess.downloadAccessAlert).toHaveBeenCalledTimes(
        1,
      )
    })

    it('still grants Pro when electionDate is in the past, alerts via Slack, and skips voter-file alert', async () => {
      const campaign: Campaign = createMockCampaign({
        details: { electionDate: pastIso() },
      })
      campaignsService.findByUserId.mockResolvedValue(campaign)

      const event = {
        type: 'checkout.session.completed',
        data: { object: buildSubscriptionSession() },
      } as unknown as Stripe.CheckoutSessionCompletedEvent

      await expect(
        service.checkoutSessionCompletedHandler(event),
      ).resolves.toBeUndefined()

      expect(campaignsService.patchCampaignDetails).toHaveBeenCalledWith(
        campaign.id,
        { subscriptionId: 'sub_test_xyz' },
      )
      expect(campaignsService.setIsPro).toHaveBeenCalledWith(campaign.id)
      expect(usersService.patchUserMetaData).toHaveBeenCalledWith(mockUser.id, {
        customerId: 'cus_test_abc',
        checkoutSessionId: null,
      })
      // Triage alert was sent
      expect(slackService.message).toHaveBeenCalled()
      const alertCall = slackService.message.mock.calls.find(([msg]) =>
        String((msg as { text?: string })?.text ?? '').includes(
          'missing/past electionDate',
        ),
      )
      expect(alertCall).toBeDefined()
      // voter file alert is skipped when election date is invalid
      expect(voterFileDownloadAccess.downloadAccessAlert).not.toHaveBeenCalled()
    })

    it('still grants Pro when electionDate is missing entirely', async () => {
      const campaign: Campaign = createMockCampaign({ details: {} })
      campaignsService.findByUserId.mockResolvedValue(campaign)

      const event = {
        type: 'checkout.session.completed',
        data: { object: buildSubscriptionSession() },
      } as unknown as Stripe.CheckoutSessionCompletedEvent

      await service.checkoutSessionCompletedHandler(event)

      expect(campaignsService.setIsPro).toHaveBeenCalledWith(campaign.id)
      expect(usersService.patchUserMetaData).toHaveBeenCalledWith(mockUser.id, {
        customerId: 'cus_test_abc',
        checkoutSessionId: null,
      })
    })
  })

  describe('replayPendingProCheckoutForUser', () => {
    it('replays the success path using the user’s stored checkoutSessionId', async () => {
      const userWithSession = createMockUser({
        id: 7,
        metaData: { checkoutSessionId: 'cs_pending_111' },
      })
      usersService.findUser.mockResolvedValueOnce(userWithSession)
      // The replay then re-enters handleSubscriptionCheckoutCompleted, which
      // calls findUser again via metadata.userId
      usersService.findUser.mockResolvedValue(userWithSession)
      stripeService.retrieveCheckoutSession.mockResolvedValue(
        buildSubscriptionSession({ id: 'cs_pending_111' }),
      )
      campaignsService.findByUserId.mockResolvedValue(
        createMockCampaign({ details: { electionDate: futureIso() } }),
      )

      const result = await service.replayPendingProCheckoutForUser(7)

      expect(stripeService.retrieveCheckoutSession).toHaveBeenCalledWith(
        'cs_pending_111',
      )
      expect(campaignsService.setIsPro).toHaveBeenCalled()
      expect(result).toEqual({
        userId: 7,
        checkoutSessionId: 'cs_pending_111',
        replayed: true,
      })
    })

    it('throws when the user has no checkoutSessionId', async () => {
      usersService.findUser.mockResolvedValue(
        createMockUser({ id: 7, metaData: null }),
      )
      await expect(service.replayPendingProCheckoutForUser(7)).rejects.toThrow(
        /no checkoutSessionId/,
      )
    })

    it('throws when the session payment_status is not paid', async () => {
      usersService.findUser.mockResolvedValue(
        createMockUser({
          id: 7,
          metaData: { checkoutSessionId: 'cs_unpaid_222' },
        }),
      )
      stripeService.retrieveCheckoutSession.mockResolvedValue(
        buildSubscriptionSession({
          id: 'cs_unpaid_222',
          payment_status: 'unpaid',
        }),
      )
      await expect(service.replayPendingProCheckoutForUser(7)).rejects.toThrow(
        /payment_status/,
      )
    })

    it('throws when the stored checkout session belongs to another user', async () => {
      usersService.findUser.mockResolvedValue(
        createMockUser({
          id: 7,
          metaData: { checkoutSessionId: 'cs_wrong_user_333' },
        }),
      )
      stripeService.retrieveCheckoutSession.mockResolvedValue(
        buildSubscriptionSession({
          id: 'cs_wrong_user_333',
          metadata: { userId: '99' },
        }),
      )

      await expect(service.replayPendingProCheckoutForUser(7)).rejects.toThrow(
        /does not belong to user/,
      )
      expect(campaignsService.setIsPro).not.toHaveBeenCalled()
    })
  })
})
