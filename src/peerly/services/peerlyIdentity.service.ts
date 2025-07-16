import { PeerlyAuthenticationService } from './peerlyAuthentication.service'
import { HttpService } from '@nestjs/axios'
import { lastValueFrom } from 'rxjs'
import { PeerlyBaseConfig } from '../config/peerlyBaseConfig'
import { isAxiosResponse } from '../../shared/util/http.util'
import { format } from '@redtea/format-axios-error'
import { BadGatewayException, Injectable, Logger } from '@nestjs/common'
import { AxiosResponse } from 'axios'
import { Campaign } from '@prisma/client'
import { CreateTcrComplianceDto } from '../../campaigns/tcrCompliance/schemas/campaignTcrCompliance.schema'

const PEERLY_ENTITY_TYPE = 'NON_PROFIT'
const PEERLY_USECASE = 'POLITICAL'

type PeerlyIdentityCreateResponseBody = {
  Data: {
    identity_id: string
    identity_name: string
    start_date: string
    account_id: string
    tcr_identity_status: string | null
  }
}

type PeerlySubmitIdentityProfileResponseBody = {
  link: string
}

type Peerly10DLCBrandSubmitResponseBody = {
  submission_key: string
}

@Injectable()
export class PeerlyIdentityService extends PeerlyBaseConfig {
  private readonly logger: Logger = new Logger(PeerlyIdentityService.name)
  constructor(
    private readonly httpService: HttpService,
    private readonly peerlyAuth: PeerlyAuthenticationService,
  ) {
    super()
  }

  private handleApiError(error: unknown): never {
    this.logger.error(
      'Failed to communicate with Peerly API',
      isAxiosResponse(error) ? format(error) : error,
    )
    throw new BadGatewayException('Failed to communicate with Peerly API')
  }

  async createIdentity(identityName: string) {
    try {
      const response: AxiosResponse<PeerlyIdentityCreateResponseBody> =
        await lastValueFrom(
          this.httpService.post(
            `${this.baseUrl}/identities`,
            {
              account_id: this.accountNumber,
              identity_name: identityName,
              usecases: [PEERLY_USECASE],
            },
            { headers: await this.peerlyAuth.getAuthorizationHeader() },
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
            { headers: await this.peerlyAuth.getAuthorizationHeader() },
          ),
        )
      const { data } = response
      const { link } = data
      this.logger.debug('Successfully submitted identity profile')
      return link
    } catch (error) {
      this.handleApiError(error)
    }
  }

  async submit10DlcBrand(
    identityId: string,
    tcrComplianceDto: CreateTcrComplianceDto,
    { details: campaignDetails }: Campaign,
  ) {
    const { phone, postalAddress, websiteDomain, email } = tcrComplianceDto
    const { streetLines, city, state, postalCode } = postalAddress
    const { campaignCommittee, einNumber } = campaignDetails
    try {
      const response: AxiosResponse<Peerly10DLCBrandSubmitResponseBody> =
        await lastValueFrom(
          this.httpService.post(
            `${this.baseUrl}/v2/tdlc/${identityId}/submit`,
            {
              entityType: PEERLY_ENTITY_TYPE,
              vertical: PEERLY_USECASE,
              is_political: true,
              displayName: (campaignCommittee || '').substring(0, 255), // Limit to 255 characters per Peerly API docs
              companyName: (campaignCommittee || '').substring(0, 255), // Limit to 255 characters per Peerly API docs
              ein: einNumber,
              phone,
              street: streetLines.join(' ').substring(0, 100), // Limit to 100 characters per Peerly API docs
              city: city.substring(0, 100), // Limit to 100 characters per Peerly API docs
              state,
              postalCode,
              website: websiteDomain.substring(0, 100), // Limit to 100 characters per Peerly API docs
              email: email.substring(0, 100), // Limit to 100 characters per Peerly API docs
            },
            { headers: await this.peerlyAuth.getAuthorizationHeader() },
          ),
        )
      const { data } = response
      const { submission_key: submissionKey } = data
      this.logger.debug('Successfully submitted identity profile')
      return submissionKey
    } catch (error) {
      this.handleApiError(error)
    }
  }
}
