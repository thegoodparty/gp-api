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
import { Campaign, PathToVictory, User } from '@prisma/client'
import { IS_PROD } from '../shared/util/appEnvironment.util'
import { UsersService } from '../users/users.service'
import { DateFormats, formatDate } from '../shared/util/date.util'
import {
  CampaignWith,
  PrimaryElectionResult,
} from '../campaigns/campaigns.types'
import {
  calculateVoterGoalsCount,
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

const { CONTENT_TYPE, AUTHORIZATION } = Headers
const { APPLICATION_JSON } = MimeTypes

const { FULLSTORY_API_KEY, ENABLE_FULLSTORY } = process.env

const FULLSTORY_ROOT_USERS_URL = 'https://api.fullstory.com/v2/users'

// TODO: Move these to the CRM module when implemented
type CRMCompanyProperties = {
  primary_election_result: PrimaryElectionResult
  election_results: string
}

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
  constructor(
    private readonly users: UsersService,
    @Inject(forwardRef(() => CampaignsService))
    private readonly campaigns: CampaignsService,
    private readonly httpService: HttpService,
  ) {}

  private readonly disabled =
    !ENABLE_FULLSTORY && (!FULLSTORY_API_KEY || !IS_PROD)

  private getTrackingProperties(
    campaign: Campaign,
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
    const { currentStep, reportedVoterGoals, hubSpotUpdates } = data || {}
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

    // TODO: Get these from CRM company object once implemented
    const {
      primary_election_result: primaryElectionResult,
      election_results: electionResults,
    } = {
      primary_election_result: PrimaryElectionResult.WON,
      election_results: 'Won General',
    } as CRMCompanyProperties

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
      reportedVoterGoalsTotalCount: reportedVoterGoalsTotalCount || 0,
      voterContactGoal: pathToVictoryData?.voterContactGoal || 'n/a',
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

  private async makeTrackingRequest(
    user: User,
    properties: TrackingProperties,
  ) {
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
    campaign: CampaignWith<'pathToVictory'>,
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
      resultCounts.updated++
    } catch (error) {
      this.logger.error(`Failed to track campaign ${campaign.id}`, error)
      resultCounts.failed++
    }
    return resultCounts
  }

  async trackCampaigns(campaigns: CampaignWith<'pathToVictory'>[]) {
    const resultCounts = await reduceAsync(
      campaigns,
      {
        updated: 0,
        skipped: 0,
        failed: 0,
      },
      this.multiTrackIterator.bind(this),
    )
    this.logger.log('FullStory trackCampaigns results:', resultCounts)
    return resultCounts
  }

  async trackByUserId(userId: number) {
    const user = await this.users.findUser({ id: userId })
    this.logger.debug(`this.disabled: ${this.disabled}`)

    if (this.disabled || !user) {
      this.logger.warn(`FullStory is disabled`)
      return
    }

    const campaign = await this.campaigns.findByUser(user.id, {
      pathToVictory: true,
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
