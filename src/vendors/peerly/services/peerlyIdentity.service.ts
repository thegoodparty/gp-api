import { HttpService } from '@nestjs/axios'
import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common'
import { method as HttpMethod } from '@poppanator/http-constants'
import { Campaign, Domain, TcrCompliance, User } from '@prisma/client'
import { format } from '@redtea/format-axios-error'
import { AxiosRequestConfig, AxiosResponse, isAxiosError } from 'axios'
import { parsePhoneNumberWithError } from 'libphonenumber-js'
import { lastValueFrom } from 'rxjs'
import { AreaCodeFromZipService } from 'src/ai/util/areaCodeFromZip.util'
import { BallotReadyPositionLevel } from '../../../campaigns/campaigns.types'
import { CampaignsService } from '../../../campaigns/services/campaigns.service'
import { CreateTcrCompliancePayload } from '../../../campaigns/tcrCompliance/campaignTcrCompliance.types'
import { DateFormats, formatDate } from '../../../shared/util/date.util'
import { ensureUrlHasProtocol } from '../../../shared/util/strings.util'
import { UsersService } from '../../../users/services/users.service'
import { getUserFullName } from '../../../users/util/users.util'
import { GooglePlacesService } from '../../google/services/google-places.service'
import { extractAddressComponents } from '../../google/util/GooglePlaces.util'
import { SlackService } from '../../slack/services/slack.service'
import { SlackChannel, SlackMessageType } from '../../slack/slackService.types'
import { PeerlyBaseConfig } from '../config/peerlyBaseConfig'
import {
  Approve10DLCBrandResponseBody,
  BuildPeerlyErrorSlackMessageBlocksParams,
  CampaignVerificationStatus,
  HandleApiErrorParams,
  Peerly10DlcBrandData,
  Peerly10DLCBrandSubmitResponseBody,
  PEERLY_COMMITTEE_TYPE,
  PEERLY_CV_VERIFICATION_TYPE,
  PeerlyCreateCVTokenResponse,
  PeerlyGetCvRequestResponseBody,
  PeerlyGetIdentitiesResponseBody,
  PeerlyHttpRequestConfig,
  PeerlyIdentity,
  PeerlyIdentityCreateResponseBody,
  PeerlyIdentityProfileResponseBody,
  PeerlyIdentityUseCaseResponseBody,
  PeerlyRetrieveCampaignVerifyStatusResponseBody,
  PeerlySubmitCVResponseBody,
  PeerlyVerifyCVPinResponse,
} from '../peerly.types'
import { getPeerlyLocaleFromBallotLevel } from '../utils/getPeerlyLocaleFromBallotLevel.util'
import {
  PEERLY_ENTITY_TYPE,
  PEERLY_LOCALITIES,
  PEERLY_USECASE,
} from './peerly.const'
import { PeerlyAuthenticationService } from './peerlyAuthentication.service'

@Injectable()
export class PeerlyIdentityService extends PeerlyBaseConfig {
  constructor(
    private readonly httpService: HttpService,
    private readonly peerlyAuth: PeerlyAuthenticationService,
    private readonly placesService: GooglePlacesService,
    private readonly slackService: SlackService,
    private readonly usersService: UsersService,
    private readonly campaignsService: CampaignsService,
    private readonly areaCodeFromZipService: AreaCodeFromZipService,
  ) {
    super()
  }

  getTCRIdentityName(userFullName: string, campaignEIN: string) {
    return this.isTestEnvironment
      ? `TEST-${userFullName} - ${campaignEIN}`
      : `${userFullName} - ${campaignEIN}`
  }

  private async handleApiError({
    error,
    requestConfig,
    httpExceptionMethod,
    peerlyIdentityId,
    campaign,
  }: HandleApiErrorParams): Promise<never> {
    const formattedError = (isAxiosError(error) && format(error)) || error
    const genericPeerlyErrorMessage = 'Peerly API ERROR'
    const errorMessage = `${genericPeerlyErrorMessage}: ${formattedError ? JSON.stringify(formattedError) : ''}`

    this.logger.error(errorMessage, !formattedError ? error : '')

    await this.slackService.message(
      {
        blocks: await this.buildPeerlyErrorSlackMessageBlocks({
          requestConfig,
          formattedError:
            typeof formattedError === 'string'
              ? formattedError
              : JSON.stringify(formattedError),
          peerlyIdentityId,
          campaign,
        }),
      },
      SlackChannel.bot10DlcCompliance,
    )

    if (httpExceptionMethod) {
      throw new httpExceptionMethod(genericPeerlyErrorMessage)
    }
    // TODO: vendor services should just throw the exception that caused the problem
    //  instead of determining the Http response w/ `BadGatewayException`.
    //  That should happen in the consumer services of vendor services:
    //  https://goodparty.clickup.com/t/86ac8y227

    throw new BadGatewayException(genericPeerlyErrorMessage, {
      cause: error,
    })
  }

  // TODO: move this out to a base service or utility once we have more than one
  //  service that needs it
  private async getAxiosRequestConfig(): Promise<AxiosRequestConfig> {
    return {
      headers: await this.peerlyAuth.getAuthorizationHeader(),
      timeout: this.httpTimeoutMs,
    }
  }

  // TODO: Figure out how to get this abstracted out to log requests via axios interceptors
  //  once this package updates their dependency:
  //  https://github.com/narando/nest-axios-interceptor/pull/655
  private async makeHttpRequest({
    url,
    method,
    data,
    config,
  }: PeerlyHttpRequestConfig): Promise<AxiosResponse> {
    this.logger.debug(
      `Initializing HTTP request: ${JSON.stringify({
        url,
        method: method.name,
        data,
        config,
      })}`,
    )
    const twoArgMethods = [HttpMethod.Get, HttpMethod.Delete, HttpMethod.Head]
    return lastValueFrom(
      twoArgMethods.includes(method.name.toUpperCase())
        ? this.httpService[method.name](url, config)
        : data
          ? this.httpService[method.name](url, data, config)
          : this.httpService[method.name](url, null, config),
    )
  }

  async createIdentity(
    identityName: string,
    campaign: Campaign,
  ): Promise<PeerlyIdentity | undefined> {
    this.logger.debug(`Creating identity with name: '${identityName}'`)
    const requestConfig = {
      url: `${this.baseUrl}/identities`,
      method: this.httpService.post,
      data: {
        account_id: this.accountNumber,
        identity_name: identityName,
        usecases: [PEERLY_USECASE],
      },
      config: await this.getAxiosRequestConfig(),
    }
    try {
      const response: AxiosResponse<PeerlyIdentityCreateResponseBody> =
        await this.makeHttpRequest(requestConfig)
      const { data } = response
      const { Data: identity } = data
      this.logger.debug(
        `Successfully created identity: ${JSON.stringify(identity)}`,
      )
      return identity
    } catch (error) {
      await this.handleApiError({
        error,
        requestConfig,
        campaign,
      })
    }
  }

  async getIdentities(campaign?: Campaign): Promise<PeerlyIdentity[]> {
    this.logger.debug('Fetching list of identities from Peerly')
    const requestConfig = {
      url: `${this.baseUrl}/identities/listByAccount`,
      method: this.httpService.get,
      config: {
        ...(await this.getAxiosRequestConfig()),
        params: {
          account_id: this.accountNumber,
        },
      } as AxiosRequestConfig,
    }
    let result: PeerlyIdentity[] = []
    try {
      const response: AxiosResponse<PeerlyGetIdentitiesResponseBody> =
        await this.makeHttpRequest(requestConfig)
      const { data } = response
      const { identities } = data
      this.logger.debug(
        `Successfully fetched ${identities.length} identities: ${JSON.stringify(identities.map((identity) => identity.identity_name))}`,
      )
      result = identities
    } catch (error) {
      await this.handleApiError({
        error,
        requestConfig,
        campaign: campaign!,
      })
    }
    return result
  }

  async getIdentityUseCases(peerlyIdentityId: string, campaign: Campaign) {
    const requestConfig = {
      url: `${this.baseUrl}/v2/tdlc/${peerlyIdentityId}/get_usecases`,
      method: this.httpService.get,
      config: (await this.getAxiosRequestConfig()) as AxiosRequestConfig,
    }
    try {
      const response: AxiosResponse<PeerlyIdentityUseCaseResponseBody> =
        await this.makeHttpRequest(requestConfig)
      const { data: useCases } = response
      this.logger.debug(
        `Successfully fetched use cases for identityId: ${peerlyIdentityId}: ${JSON.stringify(useCases)}`,
      )
      return useCases
    } catch (e) {
      if (isAxiosError(e) && e.status === 404) {
        this.logger.warn(
          `Peerly API returned 404 Not Found when fetching use cases. This is likely due to an invalid identity ID: ${peerlyIdentityId}`,
          format(e),
        )
        throw new NotFoundException(
          'Use cases for given identity ID could not be found',
        )
      }
      await this.handleApiError({
        error: e,
        requestConfig,
        campaign,
        peerlyIdentityId,
      })
    }
  }

  async submitIdentityProfile(
    peerlyIdentityId: string,
    campaign: Campaign,
  ): Promise<PeerlyIdentityProfileResponseBody | null> {
    const requestConfig = {
      url: `${this.baseUrl}/identities/${peerlyIdentityId}/submitProfile`,
      method: this.httpService.post,
      data: {
        entityType: PEERLY_ENTITY_TYPE,
        is_political: true,
      },
      config: await this.getAxiosRequestConfig(),
    }
    let result: PeerlyIdentityProfileResponseBody | null = null
    try {
      const response: AxiosResponse<PeerlyIdentityProfileResponseBody> =
        await this.makeHttpRequest(requestConfig)
      const { data } = response
      this.logger.debug(
        `Successfully submitted identity profile: ${JSON.stringify(data)}`,
      )
      result = data
    } catch (error) {
      await this.handleApiError({
        error,
        requestConfig,
        campaign,
        peerlyIdentityId,
      })
    }
    return result
  }

  async getIdentityProfile(
    peerlyIdentityId: string,
    campaign: Campaign,
  ): Promise<PeerlyIdentityProfileResponseBody | null> {
    this.logger.debug(
      `Fetching identity profile for identityId: ${peerlyIdentityId}`,
    )
    const requestConfig = {
      url: `${this.baseUrl}/identities/${peerlyIdentityId}/getProfile`,
      method: this.httpService.get,
      config: (await this.getAxiosRequestConfig()) as AxiosRequestConfig,
    }
    let result: PeerlyIdentityProfileResponseBody | null = null
    try {
      const response: AxiosResponse<PeerlyIdentityProfileResponseBody> =
        await this.makeHttpRequest(requestConfig)
      const { data } = response
      this.logger.debug(
        `Successfully fetched identity profile for identityId: ${peerlyIdentityId}: ${JSON.stringify(data)}`,
      )
      result = data || null
    } catch (e) {
      if (isAxiosError(e) && e.status === 404) {
        this.logger.warn(
          `Peerly API returned 404 Not Found when fetching identity profile. This is likely due to an invalid identity ID: ${peerlyIdentityId}`,
          format(e),
        )
        throw new NotFoundException(
          'Identity profile for given identity ID could not be found',
        )
      }
      await this.handleApiError({
        error: e,
        requestConfig,
        campaign,
        peerlyIdentityId,
      })
    }
    return result
  }

  async submit10DlcBrand(
    peerlyIdentityId: string,
    tcrCompliancePayload: CreateTcrCompliancePayload,
    campaign: Campaign,
    domain: Domain,
  ) {
    const { details: campaignDetails, placeId } = campaign
    const { phone, websiteDomain, ein } = tcrCompliancePayload
    const { street, city, state, postalCode } = extractAddressComponents(
      await this.placesService.getAddressByPlaceId(placeId!),
    )
    const { campaignCommittee } = campaignDetails
    if (!campaignCommittee) {
      throw new BadRequestException(
        'Campaign committee is required to submit 10DLC brand',
      )
    }
    const campaignCommitteeName = (
      this.isTestEnvironment ? `TEST-${campaignCommittee}` : campaignCommittee
    ).substring(0, 255) // Limit to 255 characters per Peerly API docs

    const stateCode = state?.short_name
    const postalCodeValue = postalCode?.long_name

    let areaCodes: string[] | null = null
    if (postalCodeValue) {
      areaCodes = await this.areaCodeFromZipService.getAreaCodeFromZip(postalCodeValue)
    }

    const submitBrandData: Peerly10DlcBrandData = {
      entityType: PEERLY_ENTITY_TYPE,
      vertical: PEERLY_USECASE,
      is_political: true,
      displayName: campaignCommitteeName,
      companyName: campaignCommitteeName,
      ein,
      phone: parsePhoneNumberWithError(phone, 'US').number,
      street: street?.substring(0, 100), // Limit to 100 characters per Peerly API docs
      city: city?.long_name?.substring(0, 100), // Limit to 100 characters per Peerly API docs
      state: state?.short_name,
      postalCode: postalCode?.long_name,
      website: websiteDomain.substring(0, 100), // Limit to 100 characters per Peerly API docs
      email: `info@${domain.name}`.substring(0, 100), // Limit to 100 characters per Peerly API docs
      jobAreas: stateCode && areaCodes && areaCodes.length > 0 ? [{
        didState: stateCode,
        disNpaSubset: areaCodes,
      }] : undefined
    }

    this.logger.debug(
      `Submitting 10DLC brand with data: ${JSON.stringify(submitBrandData)}`,
    )
    const requestConfig = {
      url: `${this.baseUrl}/v2/tdlc/${peerlyIdentityId}/submit`,
      method: this.httpService.post,
      data: submitBrandData,
      config: await this.getAxiosRequestConfig(),
    }
    try {
      const response: AxiosResponse<Peerly10DLCBrandSubmitResponseBody> =
        await this.makeHttpRequest(requestConfig)
      const { data } = response
      const { submission_key: submissionKey } = data
      this.logger.debug(
        `Successfully submitted 10DLC brand: ${JSON.stringify(data)}`,
      )
      return submissionKey
    } catch (error) {
      await this.handleApiError({
        error,
        requestConfig,
        campaign,
        peerlyIdentityId,
      })
    }
  }

  async approve10DLCBrand(
    { committeeName, peerlyIdentityId, campaignId }: TcrCompliance,
    campaignVerifyToken: string = '',
  ) {
    const campaign = await this.campaignsService.findFirstOrThrow({
      where: {
        id: campaignId,
      },
    })
    const data = {
      campaign_verify_token: campaignVerifyToken,
      entity_type: PEERLY_ENTITY_TYPE,
      usecase: PEERLY_USECASE,
      sample1: `Hello {first_name}, this is Jack, a volunteer from ${committeeName}. We need your support in the upcoming election. Every vote will count, please reply and let me know if you will need any help. Reply STOP to opt-out`,
      sample2: `Hello {first_name}, this is Jill, a volunteer from ${committeeName}. We're looking for volunteers for some canvassing this coming weekend and I was wondering if you may be interested? Reply STOP to opt-out`,
    }
    const requestConfig: PeerlyHttpRequestConfig = {
      url: `${this.baseUrl}/v2/tdlc/${peerlyIdentityId}/approve`,
      method: this.httpService.post,
      data,
      config: await this.getAxiosRequestConfig(),
    }
    try {
      this.logger.debug(
        `Approving 10DLC brand with data: ${JSON.stringify(data)}`,
      )
      const response: AxiosResponse<Approve10DLCBrandResponseBody> =
        await this.makeHttpRequest(requestConfig)

      const {
        data: { campaign_verify_token, ...identityBrand },
      } = response
      this.logger.debug(`Successfully approved 10DLC Brand: ${identityBrand}`)

      return identityBrand
    } catch (error) {
      await this.handleApiError({
        error,
        requestConfig,
        campaign,
        peerlyIdentityId: peerlyIdentityId!,
      })
    }
  }

  async getCampaignVerifyRequest(
    peerlyIdentityId: string,
    campaign: Campaign,
  ): Promise<PeerlyGetCvRequestResponseBody | null> {
    this.logger.debug(
      `Fetching Campaign Verify status for identityId: ${peerlyIdentityId}`,
    )
    const requestConfig = {
      url: `${this.baseUrl}/v2/tdlc/${peerlyIdentityId}/retrieve_cv`,
      method: this.httpService.get,
      config: (await this.getAxiosRequestConfig()) as AxiosRequestConfig,
    }
    let result: PeerlyGetCvRequestResponseBody | null = null
    try {
      const response: AxiosResponse<PeerlyGetCvRequestResponseBody> =
        await this.makeHttpRequest(requestConfig)
      const { data } = response
      this.logger.debug(
        `Successfully fetched Campaign Verify status for identityId: ${peerlyIdentityId}: ${JSON.stringify(data)}`,
      )
      result = data
    } catch (e) {
      if (isAxiosError(e) && e.status === 404) {
        this.logger.warn(
          `Peerly API returned 404 Not Found when fetching Campaign Verify status. This is likely due to an invalid identity ID or no CV submission: ${peerlyIdentityId}`,
          format(e),
        )
        throw new NotFoundException(
          'Campaign Verify status for given identity ID could not be found',
        )
      }
      await this.handleApiError({
        error: e,
        requestConfig,
        campaign,
        peerlyIdentityId,
      })
    }
    return result
  }

  async submitCampaignVerifyRequest(
    {
      email,
      ein,
      peerlyIdentityId,
      filingUrl,
    }: Pick<TcrCompliance, 'ein' | 'peerlyIdentityId' | 'filingUrl' | 'email'>,
    user: User,
    campaign: Campaign,
    domain: Domain,
  ): Promise<PeerlySubmitCVResponseBody | null> {
    const { details: campaignDetails, placeId } = campaign
    const { electionDate, ballotLevel } = campaignDetails
    const {
      street: filing_address_line1,
      city,
      state,
      county,
      postalCode,
    } = extractAddressComponents(
      await this.placesService.getAddressByPlaceId(placeId!),
    )
    if (!ballotLevel) {
      throw new BadRequestException(
        'Campaign must have ballotLevel to submit CV request',
      )
    }
    if (!electionDate) {
      throw new BadRequestException(
        'Campaign must have electionDate to submit CV request',
      )
    }
    const peerlyLocale = getPeerlyLocaleFromBallotLevel(ballotLevel)
    const submitCVData = {
      name: this.isTestEnvironment
        ? `TEST-${getUserFullName(user)}`
        : getUserFullName(user),
      general_campaign_email: email,
      verification_type: PEERLY_CV_VERIFICATION_TYPE.StateLocal,
      filing_url: ensureUrlHasProtocol(filingUrl),
      committee_type: PEERLY_COMMITTEE_TYPE.Candidate,
      committee_ein: ein,
      election_date: formatDate(new Date(electionDate!), DateFormats.isoDate),
      filing_address_line1,
      filing_city: city?.long_name,
      filing_state: state?.short_name,
      filing_zip: postalCode?.long_name,
      filing_email: email,
      locality: peerlyLocale,
      state: state?.short_name,
      campaign_website: domain ? `https://${domain?.name}` : undefined,
      ...(peerlyLocale === PEERLY_LOCALITIES.local
        ? {
          city_county:
            ballotLevel === BallotReadyPositionLevel.COUNTY
              ? county?.long_name
              : city?.long_name,
        }
        : {}),
    }

    const requestConfig: PeerlyHttpRequestConfig = {
      url: `${this.baseUrl}/v2/tdlc/${peerlyIdentityId}/submit_cv`,
      method: this.httpService.post,
      data: submitCVData,
      config: await this.getAxiosRequestConfig(),
    }
    let result: PeerlySubmitCVResponseBody | null = null
    try {
      this.logger.debug(
        `Submitting CV request with data: ${JSON.stringify(submitCVData)}`,
      )
      const response: AxiosResponse<PeerlySubmitCVResponseBody> =
        await this.makeHttpRequest(requestConfig)
      const { data } = response
      this.logger.debug(`Successfully submitted CV request: ${data}`)
      result = data
    } catch (error) {
      await this.handleApiError({
        error,
        requestConfig,
        campaign,
        peerlyIdentityId: peerlyIdentityId!,
      })
    }
    return result
  }

  async retrieveCampaignVerifyStatus(
    peerlyIdentityId: string,
    campaign: Campaign,
  ) {
    const requestConfig: PeerlyHttpRequestConfig = {
      url: `${this.baseUrl}/v2/tdlc/${peerlyIdentityId}/retrieve_cv`,
      method: this.httpService.get,
      config: await this.getAxiosRequestConfig(),
    }
    try {
      this.logger.debug(
        `Retrieving campaign verify status for identityId: ${peerlyIdentityId}`,
      )
      const response: AxiosResponse<PeerlyRetrieveCampaignVerifyStatusResponseBody> =
        await this.makeHttpRequest(requestConfig)
      const { data } = response
      const { verification_status } = data
      this.logger.debug(
        `Successfully retrieved campaign verify status: ${JSON.stringify(data)}`,
      )
      return verification_status
    } catch (e) {
      await this.handleApiError({
        error: e,
        requestConfig,
        campaign,
        peerlyIdentityId,
      })
    }
  }

  async verifyCampaignVerifyPin(
    peerlyIdentityId: string,
    pin: string,
    campaign: Campaign,
  ) {
    const requestConfig: PeerlyHttpRequestConfig = {
      url: `${this.baseUrl}/v2/tdlc/${peerlyIdentityId}/verify_pin`,
      method: this.httpService.post,
      data: {
        code: pin,
      },
      config: await this.getAxiosRequestConfig(),
    }
    try {
      const response: AxiosResponse<PeerlyVerifyCVPinResponse> =
        await this.makeHttpRequest(requestConfig)
      const { data } = response
      const { cv_verification_status } = data
      return cv_verification_status === CampaignVerificationStatus.VERIFIED
    } catch (e) {
      if (isAxiosError(e) && e.status === 400) {
        this.logger.warn(
          'Peerly API returned 400 Bad Request when verifying CV PIN. This is likely due to an invalid PIN. ',
          format(e),
        )
        // throw new UnprocessableEntityException('PIN could not be validated')
        await this.handleApiError({
          error: e,
          requestConfig,
          httpExceptionMethod: UnprocessableEntityException,
          campaign,
          peerlyIdentityId,
        })
      }
      await this.handleApiError({
        error: e,
        requestConfig,
        campaign,
        peerlyIdentityId,
      })
    }
  }

  async createCampaignVerifyToken(
    peerlyIdentityId: string,
    campaign: Campaign,
  ) {
    const requestConfig: PeerlyHttpRequestConfig = {
      url: `${this.baseUrl}/v2/tdlc/${peerlyIdentityId}/create_cv_token`,
      method: this.httpService.post,
      config: await this.getAxiosRequestConfig(),
    }
    try {
      this.logger.debug(
        `Creating campaign verify token for identityId: ${peerlyIdentityId}`,
      )
      const response: AxiosResponse<PeerlyCreateCVTokenResponse> =
        await this.makeHttpRequest(requestConfig)
      const { data } = response
      const { campaign_verify_token } = data
      return campaign_verify_token
    } catch (e) {
      await this.handleApiError({
        error: e,
        requestConfig,
        campaign,
        peerlyIdentityId,
      })
    }
  }

  private async buildPeerlyErrorSlackMessageBlocks({
    requestConfig,
    formattedError,
    peerlyIdentityId,
    campaign,
  }: BuildPeerlyErrorSlackMessageBlocksParams) {
    const user = await this.usersService.findByCampaign(campaign)
    const blocks = [
      {
        type: SlackMessageType.HEADER,
        text: {
          type: SlackMessageType.PLAIN_TEXT,
          text: '🚨 TCR/10DLC Compliance Flow Error 🚨',
          emoji: true,
        },
      },
      {
        type: SlackMessageType.RICH_TEXT,
        elements: [
          {
            type: SlackMessageType.RICH_TEXT_SECTION,
            elements: [
              {
                type: SlackMessageType.EMOJI,
                name: 'gp',
              },
              {
                type: SlackMessageType.TEXT,
                text: ` User:`,
                style: {
                  bold: true,
                },
              },
            ],
          },
          {
            type: SlackMessageType.RICH_TEXT_LIST,
            style: 'bullet',
            elements: [
              {
                type: SlackMessageType.RICH_TEXT_SECTION,
                elements: [
                  {
                    type: SlackMessageType.TEXT,
                    text: ' Name: ',
                    style: {
                      bold: true,
                    },
                  },
                  {
                    type: SlackMessageType.TEXT,
                    text: String(getUserFullName(user!)),
                  },
                ],
              },
              {
                type: SlackMessageType.RICH_TEXT_SECTION,
                elements: [
                  {
                    type: SlackMessageType.TEXT,
                    text: ' Email: ',
                    style: {
                      bold: true,
                    },
                  },
                  {
                    type: SlackMessageType.TEXT,
                    text: String(user!.email),
                  },
                ],
              },
              {
                type: SlackMessageType.RICH_TEXT_SECTION,
                elements: [
                  {
                    type: SlackMessageType.TEXT,
                    text: ' Phone: ',
                    style: {
                      bold: true,
                    },
                  },
                  {
                    type: SlackMessageType.TEXT,
                    text: String(user!.phone),
                  },
                ],
              },
            ],
          },
          {
            type: SlackMessageType.RICH_TEXT_SECTION,
            elements: [
              {
                type: SlackMessageType.EMOJI,
                name: 'eyeglasses',
              },
              {
                type: SlackMessageType.TEXT,
                text: ` Candidate Peerly Identity ID: ${peerlyIdentityId || 'N/A'}`,
                style: {
                  bold: true,
                },
              },
            ],
          },
        ],
      },
      {
        type: SlackMessageType.DIVIDER,
      },
      {
        type: SlackMessageType.RICH_TEXT,
        elements: [
          {
            type: SlackMessageType.RICH_TEXT_SECTION,
            elements: [
              {
                type: SlackMessageType.EMOJI,
                name: 'phone',
              },
              {
                type: SlackMessageType.TEXT,
                text: ' Request Config:',
                style: {
                  bold: true,
                },
              },
            ],
          },
          {
            type: SlackMessageType.RICH_TEXT_LIST,
            style: 'bullet',
            elements: [
              {
                type: SlackMessageType.RICH_TEXT_SECTION,
                elements: [
                  {
                    type: SlackMessageType.TEXT,
                    text: String(JSON.stringify(requestConfig)),
                  },
                ],
              },
            ].filter((elem) => elem !== undefined),
          },
        ],
      },
      {
        type: SlackMessageType.DIVIDER,
      },
      {
        type: SlackMessageType.RICH_TEXT,
        elements: [
          {
            type: SlackMessageType.RICH_TEXT_SECTION,
            elements: [
              {
                type: SlackMessageType.EMOJI,
                name: 'zap',
              },
              {
                type: SlackMessageType.TEXT,
                text: ' Response Error:',
                style: {
                  bold: true,
                },
              },
            ],
          },
          {
            type: SlackMessageType.RICH_TEXT_LIST,
            style: 'bullet',
            elements: [
              {
                type: SlackMessageType.RICH_TEXT_SECTION,
                elements: [
                  {
                    type: SlackMessageType.TEXT,
                    text: String(formattedError),
                  },
                ],
              },
            ].filter((elem) => elem !== undefined),
          },
        ],
      },
    ]
    return blocks
  }
}
