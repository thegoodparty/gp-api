import {
  BadGatewayException,
  forwardRef,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common'
import { HttpService } from '@nestjs/axios'
import { Headers, MimeTypes } from 'http-constants-ts'
import { lastValueFrom, Observable } from 'rxjs'
import axios, { AxiosResponse } from 'axios'
import { PathToVictory, User } from '@prisma/client'
import { IS_PROD } from '../shared/util/appEnvironment.util'
import { UsersService } from '../users/services/users.service'
import { DateFormats, formatDate } from '../shared/util/date.util'
import { CampaignWith } from '../campaigns/campaigns.types'
import {
  calculateVoterGoalsCount,
  countAnsweredQuestions,
  generateAiContentTrackingFlags,
} from './util/tracking.util'
import { CampaignsService } from '../campaigns/services/campaigns.service'
import {
  FullStoryUserResponse,
  SyncTrackingResultCounts,
  TrackingProperties,
} from './fullStory.types'
import { reduce as reduceAsync } from 'async'
import Bottleneck from 'bottleneck'
import { CRMCompanyProperties, PrimaryElectionResult } from '../crm/crm.types'

const { CONTENT_TYPE, AUTHORIZATION } = Headers
const { APPLICATION_JSON } = MimeTypes
const { FULLSTORY_API_KEY, ENABLE_FULLSTORY } = process.env
const enableFullStory = ENABLE_FULLSTORY === 'true'
const FULLSTORY_API_ROOT = 'https://api.fullstory.com/v2'
const FULLSTORY_ROOT_USERS_URL = `${FULLSTORY_API_ROOT}/users`
const FULLSTORY_ROOT_EVENTS_URL = `${FULLSTORY_API_ROOT}/events`

// Limits calls to FullStory to 10requests for the first 10s, then a sustained
//  rate of 30 requests per every minute
//  https://help.fullstory.com/hc/en-us/articles/360020623234-Client-API-Requirements#:~:text=properties%20have%C2%A0a-,burst%20limit%20of%2010/second%20and%20a%20sustained%20limit%20of%2030/minute.,-Events%20have%20a
const limiter = new Bottleneck({
  reservoir: 30,
  reservoirIncreaseAmount: 1,
  reservoirIncreaseInterval: 2000,
  reservoirIncreaseMaximum: 30,
  maxConcurrent: 10,
  minTime: 1000,
})

@Injectable()
export class FullStoryService {
  private readonly logger = new Logger(FullStoryService.name)
  private readonly axiosConfig = {
    headers: {
      [CONTENT_TYPE]: APPLICATION_JSON,
      [AUTHORIZATION]: `Basic ${FULLSTORY_API_KEY}`,
    },
  }
  private readonly disabled =
    !enableFullStory && (!FULLSTORY_API_KEY || !IS_PROD)

  constructor(
    private readonly campaigns: CampaignsService,
    @Inject(forwardRef(() => UsersService))
    private readonly users: UsersService,
    private readonly httpService: HttpService,
  ) {}

  private getTrackingProperties(
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

    const getCRMMonthPropertyMonthDate = (date?: Date | string) =>
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
    } as CRMCompanyProperties

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
      createdByAdmin: createdBy === 'admin',
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

  async getFullStoryUserId({ id: userId, firstName, lastName }: User) {
    this.logger.debug(`this.disabled: ${this.disabled}`)
    if (this.disabled) {
      this.logger.warn(`FullStory is disabled`)
      return
    }
    try {
      const response = await lastValueFrom(
        this.httpService.get(
          `${FULLSTORY_ROOT_USERS_URL}?uid=${userId}`,
          this.axiosConfig,
        ) as Observable<FullStoryUserResponse>,
      )

      if (response.data?.results?.length === 1) {
        return response.data.results[0].id
      }
    } catch (error) {
      if (
        axios.isAxiosError(error) &&
        (error.response as AxiosResponse) &&
        error.response?.status === HttpStatus.NOT_FOUND
      ) {
        // Tracking for when the given user doesn't exist, create it
        const createResponse = await lastValueFrom(
          this.httpService.post(
            FULLSTORY_ROOT_USERS_URL,
            {
              uid: `${userId}`,
              display_name: `${firstName} ${lastName}`, // Customize this as needed
            },
            this.axiosConfig,
          ),
        )
        return createResponse.data.id
      } else {
        throw error
      }
    }
  }

  async trackEvent(user: User, eventName: string, properties: any) {
    if (this.disabled) {
      this.logger.warn(`FullStory is disabled`)
      return
    }
    const fullStoryUserId = await this.getFullStoryUserId(user)
    if (!fullStoryUserId) {
      throw new BadGatewayException('Could not resolve FullStory user ID')
    }

    const result = await lastValueFrom(
      this.httpService.post(
        FULLSTORY_ROOT_EVENTS_URL,
        { user: { id: fullStoryUserId }, name: eventName, properties },
        { ...this.axiosConfig, method: 'POST' },
      ),
    )
    return result
  }

  private async makeTrackingRequest(
    user: User,
    properties: TrackingProperties,
  ) {
    this.logger.debug(`this.disabled: ${this.disabled}`)
    if (this.disabled) {
      this.logger.warn(`FullStory is disabled`)
      return
    }
    const fullStoryUserId = await this.getFullStoryUserId(user)
    if (!fullStoryUserId) {
      throw new BadGatewayException('Could not resolve FullStory user ID')
    }
    if (user.metaData?.fsUserId !== fullStoryUserId) {
      this.users.patchUserMetaData(user.id, { fsUserId: fullStoryUserId })
    }
    const url = `${FULLSTORY_ROOT_USERS_URL}/${fullStoryUserId}`
    this.logger.debug('Fullstory tracking url: ', url)
    this.logger.debug('Fullstory tracking properties: ', properties)
    const result = await lastValueFrom(
      this.httpService.post(url, { properties }, this.axiosConfig),
    )
    const { status, statusText, data } = result
    this.logger.debug(
      `Fullstory tracking result: ${status} ${statusText}`,
      data,
    )
  }

  private async multiTrackIterator(
    resultCounts: SyncTrackingResultCounts,
    campaign: CampaignWith<'pathToVictory' | 'campaignPositions'>,
  ) {
    try {
      const user = await this.users.findUser({ id: campaign.userId })
      await limiter.schedule(() =>
        this.makeTrackingRequest(
          user as User,
          this.getTrackingProperties(
            campaign,
            campaign.pathToVictory as PathToVictory,
          ),
        ),
      )
      return {
        ...resultCounts,
        updated: resultCounts.updated + 1,
      }
    } catch (error) {
      this.logger.error(`Failed to track campaign ${campaign.id}`, error)
      return {
        ...resultCounts,
        failed: resultCounts.failed + 1,
      }
    }
  }

  async trackCampaigns() {
    const campaigns = await this.campaigns.findMany({
      include: { pathToVictory: true },
    })
    const resultCounts = await reduceAsync(
      campaigns,
      {
        updated: 0,
        failed: 0,
      },
      this.multiTrackIterator.bind(this),
    )
    this.logger.log('FullStory trackCampaigns results:', resultCounts)
    return resultCounts
  }

  async trackUserById(userId: number) {
    const user = await this.users.findUser({ id: userId })
    if (!user) {
      return
    }

    const campaign = await this.campaigns.findByUserId(user.id, {
      pathToVictory: true,
      campaignPositions: true,
    })
    const { pathToVictory } = campaign

    // No await here. Fire and forget to avoid blocking the request
    limiter.schedule(() =>
      this.makeTrackingRequest(
        user,
        this.getTrackingProperties(campaign, pathToVictory as PathToVictory),
      ),
    )
  }
}
