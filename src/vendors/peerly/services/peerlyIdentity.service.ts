import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common'
import { Campaign, Domain, TcrCompliance, User } from '@prisma/client'
import { format } from '@redtea/format-axios-error'
import { isAxiosError } from 'axios'
import { parsePhoneNumberWithError } from 'libphonenumber-js'
import { AreaCodeFromZipService } from 'src/ai/util/areaCodeFromZip.util'
import { resolveJobGeographyFromAddress } from 'src/outreach/util/campaignGeography.util'
import { P2P_JOB_DEFAULTS } from '../constants/p2pJob.constants'
import { BallotReadyPositionLevel } from '@goodparty_org/contracts'
import { CampaignsService } from '../../../campaigns/services/campaigns.service'
import { CreateTcrCompliancePayload } from '../../../campaigns/tcrCompliance/campaignTcrCompliance.types'
import { DateFormats, formatDate } from '../../../shared/util/date.util'
import { ensureUrlHasProtocol } from '../../../shared/util/strings.util'
import { getUserFullName } from '../../../users/util/users.util'
import { GooglePlacesService } from '../../google/services/google-places.service'
import { extractAddressComponents } from '../../google/util/GooglePlaces.util'
import { PeerlyBaseConfig } from '../config/peerlyBaseConfig'
import {
  Approve10DLCBrandResponseBody,
  BrandApprovalResult,
  CampaignVerificationStatus,
  Peerly10DlcBrandData,
  Peerly10DLCBrandSubmitResponseBody,
  PEERLY_CV_VERIFICATION_TYPE,
  PeerlyCreateCVTokenResponse,
  PeerlyGetCvRequestResponseBody,
  PeerlyGetIdentitiesResponseBody,
  PeerlyIdentity,
  PeerlyIdentityCreateResponseBody,
  PeerlyIdentityProfileResponseBody,
  PeerlyIdentityUseCaseResponseBody,
  PeerlyRetrieveCampaignVerifyStatusResponseBody,
  PeerlySubmitCVResponseBody,
  PeerlyVerifyCVPinResponse,
} from '../peerly.types'
import {
  getPeerlyCommitteeType,
  getPeerlyLocaleFromOfficeLevel,
  PEERLY_ENTITY_TYPE,
  PEERLY_LOCALITIES,
  PEERLY_USECASE,
} from './peerly.const'
import { PeerlyHttpService } from './peerlyHttp.service'
import { PinoLogger } from 'nestjs-pino'

@Injectable()
export class PeerlyIdentityService extends PeerlyBaseConfig {
  constructor(
    protected readonly logger: PinoLogger,
    private readonly peerlyHttpService: PeerlyHttpService,
    private readonly placesService: GooglePlacesService,
    private readonly campaignsService: CampaignsService,
    private readonly areaCodeFromZipService: AreaCodeFromZipService,
  ) {
    super(logger)
  }

  getTCRIdentityName(userFullName: string, campaignEIN: string) {
    return this.isTestEnvironment
      ? `TEST-${userFullName} - ${campaignEIN}`
      : `${userFullName} - ${campaignEIN}`
  }

  async createIdentity(
    identityName: string,
    campaign: Campaign,
    user: User,
  ): Promise<PeerlyIdentity | undefined> {
    this.logger.debug(`Creating identity with name: '${identityName}'`)
    try {
      const response =
        await this.peerlyHttpService.post<PeerlyIdentityCreateResponseBody>(
          '/identities',
          {
            account_id: this.accountNumber,
            identity_name: identityName,
            usecases: [PEERLY_USECASE],
          },
        )
      const { data } = response
      const { Data: identity } = data
      this.logger.debug({ identity }, 'Successfully created identity:')
      return identity
    } catch (error) {
      await this.peerlyHttpService.handleApiError(error, { campaign, user })
    }
  }

  async getIdentities(
    campaign: Campaign,
    user: User,
  ): Promise<PeerlyIdentity[]> {
    this.logger.debug('Fetching list of identities from Peerly')
    let result: PeerlyIdentity[] = []
    try {
      const response =
        await this.peerlyHttpService.get<PeerlyGetIdentitiesResponseBody>(
          '/identities/listByAccount',
          { params: { account_id: this.accountNumber } },
        )
      const { data } = response
      const { identities } = data
      this.logger.debug(
        { data: identities.map((identity) => identity.identity_name) },
        `Successfully fetched ${identities.length} identities: `,
      )
      result = identities
    } catch (error) {
      await this.peerlyHttpService.handleApiError(error, { campaign, user })
    }
    return result
  }

  async getIdentityUseCases(
    peerlyIdentityId: string,
    campaign: Campaign,
    user: User,
  ) {
    try {
      const response =
        await this.peerlyHttpService.get<PeerlyIdentityUseCaseResponseBody>(
          `/v2/tdlc/${peerlyIdentityId}/get_usecases`,
        )
      const { data: useCases } = response
      this.logger.debug(
        { useCases },
        `Successfully fetched use cases for identityId: ${peerlyIdentityId}: `,
      )
      return useCases
    } catch (e) {
      if (isAxiosError(e) && e.status === 404) {
        this.logger.warn(
          format(e),
          `Peerly API returned 404 Not Found when fetching use cases. This is likely due to an invalid identity ID: ${peerlyIdentityId}`,
        )
        throw new NotFoundException(
          'Use cases for given identity ID could not be found',
        )
      }
      await this.peerlyHttpService.handleApiError(e, {
        campaign,
        peerlyIdentityId,
        user,
      })
    }
  }

  async submitIdentityProfile(
    peerlyIdentityId: string,
    campaign: Campaign,
    user: User,
  ): Promise<PeerlyIdentityProfileResponseBody | null> {
    let result: PeerlyIdentityProfileResponseBody | null = null
    try {
      const response =
        await this.peerlyHttpService.post<PeerlyIdentityProfileResponseBody>(
          `/identities/${peerlyIdentityId}/submitProfile`,
          {
            entityType: PEERLY_ENTITY_TYPE,
            is_political: true,
          },
        )
      const { data } = response
      this.logger.debug({ data }, 'Successfully submitted identity profile:')
      result = data
    } catch (error) {
      await this.peerlyHttpService.handleApiError(error, {
        campaign,
        peerlyIdentityId,
        user,
      })
    }
    return result
  }

  async getIdentityProfile(
    peerlyIdentityId: string,
    campaign: Campaign,
    user: User,
  ): Promise<PeerlyIdentityProfileResponseBody | null> {
    this.logger.debug(
      `Fetching identity profile for identityId: ${peerlyIdentityId}`,
    )
    let result: PeerlyIdentityProfileResponseBody | null = null
    try {
      const response =
        await this.peerlyHttpService.get<PeerlyIdentityProfileResponseBody>(
          `/identities/${peerlyIdentityId}/getProfile`,
        )
      const { data } = response
      this.logger.debug(
        { data },
        `Successfully fetched identity profile for identityId: ${peerlyIdentityId}: `,
      )
      result = data || null
    } catch (e) {
      if (isAxiosError(e) && e.status === 404) {
        this.logger.warn(
          format(e),
          `Peerly API returned 404 Not Found when fetching identity profile. This is likely due to an invalid identity ID: ${peerlyIdentityId}`,
        )
        throw new NotFoundException(
          'Identity profile for given identity ID could not be found',
        )
      }
      await this.peerlyHttpService.handleApiError(e, {
        campaign,
        peerlyIdentityId,
        user,
      })
    }
    return result
  }

  async submit10DlcBrand(
    peerlyIdentityId: string,
    tcrCompliancePayload: CreateTcrCompliancePayload,
    campaign: Campaign,
    domain: Domain,
    user: User,
  ) {
    const { details: campaignDetails, placeId } = campaign
    const { phone, websiteDomain, ein } = tcrCompliancePayload
    const { street, city, state, postalCode } = extractAddressComponents(
      // TODO(ENG-6400): using `placeId!` is dangerous here.
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

    const geography = await resolveJobGeographyFromAddress(
      {
        stateCode: state?.short_name?.trim(),
        postalCodeValue: postalCode?.long_name ?? '',
      },
      { areaCodeFromZipService: this.areaCodeFromZipService },
    )

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
      ...(geography.didState !== P2P_JOB_DEFAULTS.DID_STATE
        ? {
            jobAreas: [
              {
                didState: geography.didState,
                ...(geography.didNpaSubset.length > 0 && {
                  didNpaSubset: geography.didNpaSubset,
                }),
              },
            ],
          }
        : {}),
    }

    this.logger.debug({ submitBrandData }, 'Submitting 10DLC brand with data:')
    try {
      const response =
        await this.peerlyHttpService.post<Peerly10DLCBrandSubmitResponseBody>(
          `/v2/tdlc/${peerlyIdentityId}/submit`,
          submitBrandData,
        )
      const { data } = response
      const { submission_key: submissionKey } = data
      this.logger.debug({ data }, 'Successfully submitted 10DLC brand:')
      return submissionKey
    } catch (error) {
      await this.peerlyHttpService.handleApiError(error, {
        campaign,
        peerlyIdentityId,
        user,
      })
    }
  }

  async approve10DLCBrand(
    { committeeName, peerlyIdentityId, campaignId }: TcrCompliance,
    campaignVerifyToken: string = '',
    user?: User,
  ): Promise<BrandApprovalResult | undefined> {
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
    try {
      this.logger.debug({ data }, 'Approving 10DLC brand with data:')
      const response =
        await this.peerlyHttpService.post<Approve10DLCBrandResponseBody>(
          `/v2/tdlc/${peerlyIdentityId}/approve`,
          data,
        )

      const {
        data: {
          campaign_verify_token: _campaign_verify_token,
          ...identityBrand
        },
      } = response
      this.logger.debug(`Successfully approved 10DLC Brand: ${identityBrand}`)

      return identityBrand
    } catch (error) {
      await this.peerlyHttpService.handleApiError(error, {
        campaign,
        peerlyIdentityId: peerlyIdentityId ?? undefined,
        user,
      })
    }
  }

  async getCampaignVerifyRequest(
    peerlyIdentityId: string,
    campaign: Campaign,
    user: User,
  ): Promise<PeerlyGetCvRequestResponseBody | null> {
    this.logger.debug(
      `Fetching Campaign Verify status for identityId: ${peerlyIdentityId}`,
    )
    let result: PeerlyGetCvRequestResponseBody | null = null
    try {
      const response =
        await this.peerlyHttpService.get<PeerlyGetCvRequestResponseBody>(
          `/v2/tdlc/${peerlyIdentityId}/retrieve_cv`,
        )
      const { data } = response
      this.logger.debug(
        { data },
        `Successfully fetched Campaign Verify status for identityId: ${peerlyIdentityId}: `,
      )
      result = data
    } catch (e) {
      if (isAxiosError(e)) {
        // Peerly returns 400 with nested status_code: 404 when CV doesn't exist
        const is404 =
          e.status === 404 ||
          (e.status === 400 && e.response?.data?.status_code === 404)

        if (is404) {
          this.logger.debug(
            `No Campaign Verify request found for identityId: ${peerlyIdentityId} (first-time registration)`,
          )
          return null
        }
      }
      await this.peerlyHttpService.handleApiError(e, {
        campaign,
        peerlyIdentityId,
        user,
      })
    }
    return result
  }

  async submitCampaignVerifyRequest(
    {
      email,
      ein,
      phone,
      peerlyIdentityId,
      filingUrl,
      officeLevel,
      fecCommitteeId,
      committeeType,
    }: Pick<
      TcrCompliance,
      | 'ein'
      | 'phone'
      | 'peerlyIdentityId'
      | 'filingUrl'
      | 'email'
      | 'officeLevel'
      | 'fecCommitteeId'
      | 'committeeType'
    >,
    user: User,
    campaign: Campaign,
    domain: Domain,
  ): Promise<PeerlySubmitCVResponseBody | null> {
    const { details: campaignDetails, placeId } = campaign
    const { electionDate, ballotLevel } = campaignDetails

    if (!electionDate) {
      throw new BadRequestException(
        'Campaign must have electionDate to submit CV request',
      )
    }

    const {
      street: filing_address_line1,
      city,
      state,
      county,
      postalCode,
    } = extractAddressComponents(
      // TODO(ENG-6400): using `placeId!` is dangerous here.
      await this.placesService.getAddressByPlaceId(placeId!),
    )

    // Map officeLevel to Peerly locality
    const peerlyLocale = getPeerlyLocaleFromOfficeLevel(officeLevel)

    const verificationType =
      peerlyLocale === PEERLY_LOCALITIES.federal
        ? PEERLY_CV_VERIFICATION_TYPE.Federal
        : PEERLY_CV_VERIFICATION_TYPE.StateLocal

    const isFederal = peerlyLocale === PEERLY_LOCALITIES.federal
    const isLocal = peerlyLocale === PEERLY_LOCALITIES.local

    // Validate required federal fields
    if (isFederal) {
      if (!fecCommitteeId) {
        this.logger.error(
          `[Campaign Verify] Missing fec_committee_id for federal submission (campaignId=${campaign.id}). ` +
            `This field is required by Peerly for federal verification.`,
        )
        throw new BadRequestException(
          `FEC Committee ID is required for federal candidates.`,
        )
      }
    }

    const isMissingLocalLocation =
      isLocal && !city?.long_name && !county?.long_name
    if (isMissingLocalLocation) {
      this.logger.warn(
        `[Campaign Verify] Missing city_county for local submission (campaignId=${campaign.id}). ` +
          `This field is required by Peerly when locality is 'local'.`,
      )
    }

    const submitCVData = {
      name: this.isTestEnvironment
        ? `TEST-${getUserFullName(user)}`
        : getUserFullName(user),
      general_campaign_email: email,
      verification_type: verificationType,
      filing_url: ensureUrlHasProtocol(filingUrl),
      // Map Prisma enum to Peerly API values
      committee_type: getPeerlyCommitteeType(committeeType),
      committee_ein: ein,
      election_date: formatDate(new Date(electionDate), DateFormats.isoDate),
      filing_address_line1,
      filing_city: city?.long_name,
      filing_state: state?.short_name,
      filing_zip: postalCode?.long_name,
      filing_email: email,
      verification_method: 'email',
      filing_url_instructions:
        "Deliver the PIN using the first contact information that matches the candidate's election filing, in the following order: email, text, phone call, then postal mail. If the filing is not publicly available, contact the election authority.",
      locality: peerlyLocale,
      // Peerly/CV can actually tell themselves if it's a landline or a cell message.
      // James from Peerly recommended we send this to cell to have a chance of text messages going through.
      filing_phone_type: 'cell',
      filing_phone_number: phone,
      state: state?.short_name,
      campaign_website: domain ? `https://${domain?.name}` : undefined,
      // Federal-specific fields
      ...(isFederal
        ? {
            fec_committee_id: fecCommitteeId,
          }
        : {}),
      // Local-specific fields
      ...(isLocal
        ? {
            city_county:
              ballotLevel === BallotReadyPositionLevel.COUNTY
                ? county?.long_name
                : city?.long_name,
          }
        : {}),
    }

    let result: PeerlySubmitCVResponseBody | null = null
    try {
      this.logger.debug({ submitCVData }, 'Submitting CV request with data:')
      const response =
        await this.peerlyHttpService.post<PeerlySubmitCVResponseBody>(
          `/v2/tdlc/${peerlyIdentityId}/submit_cv`,
          submitCVData,
        )
      const { data } = response
      this.logger.debug(`Successfully submitted CV request: ${data}`)
      result = data
    } catch (error) {
      await this.peerlyHttpService.handleApiError(error, {
        campaign,
        peerlyIdentityId: peerlyIdentityId ?? undefined,
        user,
      })
    }
    return result
  }

  async retrieveCampaignVerifyStatus(
    peerlyIdentityId: string,
    campaign: Campaign,
    user: User,
  ) {
    try {
      this.logger.debug(
        `Retrieving campaign verify status for identityId: ${peerlyIdentityId}`,
      )
      const response =
        await this.peerlyHttpService.get<PeerlyRetrieveCampaignVerifyStatusResponseBody>(
          `/v2/tdlc/${peerlyIdentityId}/retrieve_cv`,
        )
      const { data } = response
      const { verification_status } = data
      this.logger.debug(
        { data },
        'Successfully retrieved campaign verify status:',
      )
      return verification_status
    } catch (e) {
      await this.peerlyHttpService.handleApiError(e, {
        campaign,
        peerlyIdentityId,
        user,
      })
    }
  }

  async verifyCampaignVerifyPin(
    peerlyIdentityId: string,
    pin: string,
    campaign: Campaign,
    user: User,
  ) {
    try {
      const response =
        await this.peerlyHttpService.post<PeerlyVerifyCVPinResponse>(
          `/v2/tdlc/${peerlyIdentityId}/verify_pin`,
          { code: pin },
        )
      const { data } = response
      const { cv_verification_status } = data
      return cv_verification_status === CampaignVerificationStatus.VERIFIED
    } catch (e) {
      if (isAxiosError(e) && e.status === 400) {
        this.logger.warn(
          format(e),
          'Peerly API returned 400 Bad Request when verifying CV PIN. This is likely due to an invalid PIN. ',
        )
        // throw new UnprocessableEntityException('PIN could not be validated')
        await this.peerlyHttpService.handleApiError(e, {
          campaign,
          peerlyIdentityId,
          user,
          httpExceptionClass: UnprocessableEntityException,
        })
      }
      await this.peerlyHttpService.handleApiError(e, {
        campaign,
        peerlyIdentityId,
        user,
      })
    }
  }

  async createCampaignVerifyToken(
    peerlyIdentityId: string,
    campaign: Campaign,
    user: User,
  ) {
    try {
      this.logger.debug(
        `Creating campaign verify token for identityId: ${peerlyIdentityId}`,
      )
      const response =
        await this.peerlyHttpService.post<PeerlyCreateCVTokenResponse>(
          `/v2/tdlc/${peerlyIdentityId}/create_cv_token`,
        )
      const { data } = response
      const { campaign_verify_token } = data
      return campaign_verify_token
    } catch (e) {
      await this.peerlyHttpService.handleApiError(e, {
        campaign,
        peerlyIdentityId,
        user,
      })
    }
  }
}
