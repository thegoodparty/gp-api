import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common'
import { HttpService } from '@nestjs/axios'
import { Headers, MimeTypes } from 'http-constants-ts'
import { PathToVictory, User } from '@prisma/client'
import { UsersService } from '../users/services/users.service'
import { DateFormats, formatDate } from '../shared/util/date.util'
import { CampaignCreatedBy, CampaignWith } from '../campaigns/campaigns.types'
import {
  calculateVoterGoalsCount,
  countAnsweredQuestions,
  generateAiContentTrackingFlags,
} from './util/tracking.util'
import { CampaignsService } from '../campaigns/services/campaigns.service'
import { TrackingProperties } from './analytics.types'
import Bottleneck from 'bottleneck'
import { PrimaryElectionResult } from '../crm/crm.types'
import { SlackService } from 'src/shared/services/slack.service'
import { SegmentService } from 'src/segment/segment.service'
import Stripe from 'stripe'
import { EVENTS } from 'src/segment/segment.types'

const { CONTENT_TYPE, AUTHORIZATION } = Headers
const { APPLICATION_JSON } = MimeTypes

const limiter = new Bottleneck({
  reservoir: 30,
  reservoirIncreaseAmount: 1,
  reservoirIncreaseInterval: 2000,
  reservoirIncreaseMaximum: 30,
  maxConcurrent: 10,
  minTime: 1000,
})

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name)

  constructor(
    private readonly campaigns: CampaignsService,
    @Inject(forwardRef(() => UsersService))
    private readonly users: UsersService,
    private readonly httpService: HttpService,
    private readonly slack: SlackService,
    private readonly segment: SegmentService,
  ) {}

  private getTrackingProperties(
    user: User,
    campaign: CampaignWith<'campaignPositions' | 'pathToVictory'>,
    pathToVictory: PathToVictory,
  ): TrackingProperties {
    const { slug, isActive, details, data, isVerified, isPro, aiContent } =
      campaign || {}
    const {
      electionDate,
      primaryElectionDate,
      ballotLevel,
      state,
      pledged,
      party,
      filingPeriodsStart,
      filingPeriodsEnd,
    } = details || {}
    const { currentStep, reportedVoterGoals, hubSpotUpdates, createdBy } =
      data || {}
    const { calls, digital, directMail, digitalAds, text, events } =
      reportedVoterGoals || {}

    const pathToVictoryData = pathToVictory?.data || {}

    const reportedVoterGoalsTotalCount =
      calculateVoterGoalsCount(reportedVoterGoals)

    const getCRMMonthPropertyMonthDate = (date?: Date | string | null) =>
      date ? formatDate(date, DateFormats.crmPropertyMonthDate) : ''

    const electionDateMonth = getCRMMonthPropertyMonthDate(electionDate)
    const primaryElectionDateMonth =
      getCRMMonthPropertyMonthDate(primaryElectionDate)
    const filingPeriodsStartMonth =
      getCRMMonthPropertyMonthDate(filingPeriodsStart)
    const filingPeriodsEndMonth = getCRMMonthPropertyMonthDate(filingPeriodsEnd)

    const {
      primary_election_result: primaryElectionResult,
      election_results: electionResults,
    } = {
      primary_election_result: PrimaryElectionResult.WON,
      election_results: 'Won General',
    }
    const { answeredQuestions } = countAnsweredQuestions(
      campaign,
      campaign.campaignPositions,
    )

    return {
      slug,
      isActive,
      electionDate, // Date as a string
      primaryElectionDate,
      primaryElectionResult,
      electionResults,
      level: ballotLevel ? ballotLevel.toLowerCase() : undefined,
      state,
      pledged,
      party,
      currentStep,
      isVerified,
      isPro,
      sessionCount: user?.metaData?.sessionCount || 0,
      createdByAdmin: createdBy === CampaignCreatedBy.ADMIN,
      aiContentCount: aiContent ? Object.keys(aiContent).length : 0,
      p2vStatus: pathToVictoryData?.p2vStatus || 'n/a',
      electionDateStr: electionDateMonth,
      primaryElectionDateStr: primaryElectionDateMonth,
      filingPeriodsStartMonth,
      filingPeriodsEndMonth,
      callsMade: calls || 0,
      onlineImpressions: digital || 0,
      directMail: directMail || 0,
      digitalAds: digitalAds || 0,
      smsSent: text || 0,
      events: events || 0,
      reportedVoterGoals: reportedVoterGoals || {},
      reportedVoterGoalsTotalCount: reportedVoterGoalsTotalCount || 0,
      voterContactGoal: pathToVictoryData?.voterContactGoal || 'n/a',
      voterContactPercentage: pathToVictoryData?.voterContactGoal
        ? (reportedVoterGoalsTotalCount /
            Number(pathToVictoryData?.voterContactGoal)) *
          100
        : 'n/a',
      contentQuestionsAnswered: answeredQuestions,
      ...(hubSpotUpdates || {}),
      ...generateAiContentTrackingFlags(aiContent),
    }
  }

  async trackEvent(user: User, eventName: string, properties: any) {
    return this.segment.trackEvent(user.id, eventName, properties)
  }

  track(
    userId: number,
    eventName: string,
    properties?: Record<string, unknown>,
  ) {
    this.segment.trackEvent(userId, eventName, properties)
  }

  identify(userId: number, traits: Record<string, unknown>) {
    this.segment.identify(userId, traits)
  }

  async trackProPayment(userId: number, session: Stripe.Checkout.Session) {
    const subscription = session.subscription as Stripe.Subscription
    const item = subscription.items.data[0]
    const price = item?.price?.unit_amount_decimal
      ? Number(item.price.unit_amount_decimal) / 100
      : 0
    const intent = session.payment_intent as Stripe.PaymentIntent
    const pm = intent.payment_method as Stripe.PaymentMethod

    const paymentMethod =
      pm.type === 'card' ? (pm.card?.wallet?.type ?? 'credit card') : pm.type

    this.segment.trackEvent(userId, EVENTS.Account.ProSubscriptionConfirmed, {
      price,
      paymentMethod,
      renewalDate: new Date(
        subscription.current_period_end * 1000,
      ).toISOString(),
    })
  }
}
