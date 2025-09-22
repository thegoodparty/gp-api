import { PeerlyAuthenticationService } from './peerlyAuthentication.service'
import { HttpService } from '@nestjs/axios'
import { lastValueFrom } from 'rxjs'
import { PeerlyBaseConfig } from '../config/peerlyBaseConfig'
import { isAxiosResponse } from '../../../shared/util/http.util'
import { format } from '@redtea/format-axios-error'
import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common'
import { AxiosResponse, isAxiosError } from 'axios'
import { Campaign, Domain, TcrCompliance, User } from '@prisma/client'
import { getUserFullName } from '../../../users/util/users.util'
import {
  Approve10DLCBrandResponse,
  CampaignVerificationStatus,
  Peerly10DLCBrandSubmitResponseBody,
  PEERLY_COMMITTEE_TYPE,
  PEERLY_CV_VERIFICATION_TYPE,
  PeerlyCreateCVTokenResponse,
  PeerlyIdentityCreateResponseBody,
  PeerlyIdentityUseCaseResponseBody,
  PeerlySubmitIdentityProfileResponseBody,
  PeerlyVerifyCVPinResponse,
} from '../peerly.types'
import { GooglePlacesService } from '../../google/services/google-places.service'
import { extractAddressComponents } from '../../google/util/GooglePlaces.util'
import { DateFormats, formatDate } from '../../../shared/util/date.util'
import { parsePhoneNumberWithError } from 'libphonenumber-js'
import { BallotReadyPositionLevel } from '../../../campaigns/campaigns.types'
import { CreateTcrCompliancePayload } from '../../../campaigns/tcrCompliance/campaignTcrCompliance.types'
import {
  PEERLY_ENTITY_TYPE,
  PEERLY_LOCALITIES,
  PEERLY_LOCALITY_CATEGORIES,
  PEERLY_USECASE,
} from './peerly.const'
import { ensureUrlHasProtocol } from '../../../shared/util/strings.util'

@Injectable()
export class PeerlyIdentityService extends PeerlyBaseConfig {
  constructor(
    private readonly httpService: HttpService,
    private readonly peerlyAuth: PeerlyAuthenticationService,
    private readonly placesService: GooglePlacesService,
  ) {
    super()
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  private handleApiError(error: unknown): never {
    this.logger.error(
      'Failed to communicate with Peerly API',
      isAxiosResponse(error) ? format(error) : error,
    )
    throw new BadGatewayException('Failed to communicate with Peerly API')
  }

  // TODO: move this out to a base service or utility once we have more than one
  //  service that needs it
  private async getBaseHttpHeaders() {
    return {
      headers: await this.peerlyAuth.getAuthorizationHeader(),
      timeout: this.httpTimeoutMs,
    }
  }

  async createIdentity(identityName: string) {
    try {
      const response: AxiosResponse<PeerlyIdentityCreateResponseBody> =
        await lastValueFrom(
          this.httpService.post(
            `${this.baseUrl}/identities`,
            {
              account_id: this.accountNumber,
              identity_name: this.isTestEnvironment
                ? `TEST-${identityName}`
                : identityName,
              usecases: [PEERLY_USECASE],
            },
            await this.getBaseHttpHeaders(),
          ),
        )
      const { data } = response
      const { Data: identity } = data
      this.logger.debug('Successfully created identity', identity)
      return identity
    } catch (error) {
      this.handleApiError(error)
    }
  }

  async getIdentityUseCases(peerlyIdentityId: string) {
    try {
      const response: AxiosResponse<PeerlyIdentityUseCaseResponseBody> =
        await lastValueFrom(
          this.httpService.get(
            `${this.baseUrl}/v2/tdlc/${peerlyIdentityId}/get_usecases`,
            await this.getBaseHttpHeaders(),
          ),
        )
      const { data: useCases } = response
      this.logger.debug(
        `Successfully fetched use cases for identityId: ${peerlyIdentityId}`,
        useCases,
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
      this.handleApiError(e)
    }
  }

  async submitIdentityProfile(identityId: string) {
    try {
      const response: AxiosResponse<PeerlySubmitIdentityProfileResponseBody> =
        await lastValueFrom(
          this.httpService.post(
            `${this.baseUrl}/identities/${identityId}/submitProfile`,
            {
              entityType: PEERLY_ENTITY_TYPE,
              is_political: true,
              usecases: [PEERLY_USECASE],
            },
            await this.getBaseHttpHeaders(),
          ),
        )
      const { data } = response
      const { link } = data
      this.logger.debug('Successfully submitted identity profile', data)
      return link
    } catch (error) {
      this.handleApiError(error)
    }
  }

  async submit10DlcBrand(
    identityId: string,
    tcrCompliancePayload: CreateTcrCompliancePayload,
    { details: campaignDetails, placeId }: Campaign,
  ) {
    const { phone, websiteDomain, email, ein } = tcrCompliancePayload
    const { street, city, state, postalCode } = extractAddressComponents(
      await this.placesService.getAddressByPlaceId(placeId!),
    )
    const { campaignCommittee } = campaignDetails
    if (!campaignCommittee) {
      throw new BadRequestException(
        'Campaign committee is required to submit 10DLC brand',
      )
    }
    try {
      const campaignCommitteeName = (
        this.isTestEnvironment ? `TEST-${campaignCommittee}` : campaignCommittee
      ).substring(0, 255) // Limit to 255 characters per Peerly API docs
      const submitBrandData = {
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
        email: email.substring(0, 100), // Limit to 100 characters per Peerly API docs
      }
      this.logger.debug('Submitting 10DLC brand with data:', submitBrandData)
      const response: AxiosResponse<Peerly10DLCBrandSubmitResponseBody> =
        await lastValueFrom(
          this.httpService.post(
            `${this.baseUrl}/v2/tdlc/${identityId}/submit`,
            submitBrandData,
            await this.getBaseHttpHeaders(),
          ),
        )
      const { data } = response
      const { submission_key: submissionKey } = data
      this.logger.debug('Successfully submitted 10DLC brand', data)
      return submissionKey
    } catch (error) {
      this.handleApiError(error)
    }
  }

  async approve10DLCBrand(
    user: User,
    { committeeName, peerlyIdentityId }: TcrCompliance,
    campaignVerifyToken: string = '',
  ) {
    try {
      const response: AxiosResponse<Approve10DLCBrandResponse> =
        await lastValueFrom(
          this.httpService.post(
            `${this.baseUrl}/v2/tdlc/${peerlyIdentityId}/submit`,
            {
              campaign_verify_token: campaignVerifyToken,
              entity_type: PEERLY_ENTITY_TYPE,
              usecase: PEERLY_USECASE,
              sample1: `Hello {first_name}, this is ${getUserFullName(user)}, a volunteer from ${committeeName}. We need your support in the upcoming election. Every vote will count, please reply and let me know if you will need any help. Reply STOP to opt-out`,
              sample2: `Hello {first_name}, this is ${getUserFullName(user)}, a volunteer from ${committeeName}. We're looking for volunteers for some canvassing this coming weekend and I was wondering if you may be interested?. Reply STOP to opt-out`,
            },
            await this.getBaseHttpHeaders(),
          ),
        )

      const {
        data: { campaign_verify_token, ...identityBrand },
      } = response
      this.logger.debug('Successfully approved 10DLC Brand', identityBrand)

      return identityBrand
    } catch (error) {
      this.handleApiError(error)
    }
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
  ) {
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
    const peerlyLocale = getPeerlyLocalFromBallotLevel(ballotLevel)
    try {
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
      this.logger.debug('Submitting CV request with data:', submitCVData)
      const response = await lastValueFrom(
        this.httpService.post(
          `${this.baseUrl}/v2/tdlc/${peerlyIdentityId}/submit_cv`,
          submitCVData,
          await this.getBaseHttpHeaders(),
        ),
      )
      const { data } = response
      this.logger.debug('Successfully submitted CV request', data)
      return data
    } catch (error) {
      this.handleApiError(error)
    }
  }

  async verifyCampaignVerifyPin(peerlyIdentityId: string, pin: string) {
    try {
      const response: AxiosResponse<PeerlyVerifyCVPinResponse> =
        await lastValueFrom(
          this.httpService.post(
            `${this.baseUrl}/v2/tdlc/${peerlyIdentityId}/verify_pin`,
            {
              code: pin,
            },
            await this.getBaseHttpHeaders(),
          ),
        )
      const { data } = response
      const { cv_verification_status } = data
      return cv_verification_status === CampaignVerificationStatus.VERIFIED
    } catch (e) {
      if (isAxiosError(e) && e.status === 400) {
        this.logger.warn(
          'Peerly API returned 400 Bad Request when verifying CV PIN. This is likely due to an invalid PIN. ',
          format(e),
        )
        throw new UnprocessableEntityException('PIN could not be validated')
      }
      this.handleApiError(e)
    }
  }

  async createCampaignVerifyToken(peerlyIdentityId: string) {
    try {
      const response: AxiosResponse<PeerlyCreateCVTokenResponse> =
        await lastValueFrom(
          this.httpService.post(
            `${this.baseUrl}/v2/tdlc/${peerlyIdentityId}/create_cv_token`,
            null,
            await this.getBaseHttpHeaders(),
          ),
        )
      const { data } = response
      const { campaign_verify_token } = data
      return campaign_verify_token
    } catch (e) {
      this.handleApiError(e)
    }
  }
}

export const getPeerlyLocalFromBallotLevel = (
  ballotLevel: BallotReadyPositionLevel,
) =>
  Object.keys(PEERLY_LOCALITY_CATEGORIES).find((key) =>
    PEERLY_LOCALITY_CATEGORIES[key].includes(ballotLevel),
  )
