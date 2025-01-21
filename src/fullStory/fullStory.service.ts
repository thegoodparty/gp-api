import { forwardRef, HttpStatus, Inject, Injectable } from '@nestjs/common'
import { HttpService } from '@nestjs/axios'
import { Headers, MimeTypes } from 'http-constants-ts'
import { lastValueFrom, Observable } from 'rxjs'
import axios, { AxiosResponse } from 'axios'
import { User } from '@prisma/client'
import { IS_PROD } from '../shared/util/appEnvironment.util'
import { UsersService } from '../users/users.service'
import { DateFormats, formatDate } from '../shared/util/date.util'
import { PrimaryElectionResult } from '../campaigns/campaigns.types'
import {
  calculateVoterGoalsCount,
  generateAiContentTrackingFlags,
} from './util/tracking.util'
import { CampaignsService } from '../campaigns/services/campaigns.service'
import { FullStoryUserResponse } from './fullStory.types'

const { CONTENT_TYPE, AUTHORIZATION } = Headers
const { APPLICATION_JSON } = MimeTypes

const { FULLSTORY_API_KEY, ENABLE_FULLSTORY } = process.env

const FULLSTORY_ROOT_USERS_URL = 'https://org.fullstory.com/api/v2/users'

// TODO: Move these to the CRM module when implemented
type CRMCompanyProperties = {
  primary_election_result: PrimaryElectionResult
  election_results: string
}

@Injectable()
export class FullStoryService {
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

  async getFullStoryUserId({ id: userId, firstName, lastName }: User) {
    if (this.disabled) {
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
        const fsUserId = createResponse.data.id
        await this.users.patchUserMetaData(userId, { fsUserId })
        return fsUserId
      } else {
        throw error
      }
    }
  }

  async trackUser(userId: number) {
    const user = await this.users.findUser({ id: userId })
    if (this.disabled || !user) {
      return
    }

    const campaign = await this.campaigns.findByUser(user.id, {
      pathToVictory: true,
    })
    const { pathToVictory } = campaign

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

    const properties = {
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

    return this.httpService.post(
      `${FULLSTORY_ROOT_USERS_URL}/${await this.getFullStoryUserId(user)}`,
      { properties },
      this.axiosConfig,
    )
  }
}
