import { PeerlyAuthenticationService } from './peerlyAuthentication.service'
import { HttpService } from '@nestjs/axios'
import { lastValueFrom } from 'rxjs'
import { PeerlyBaseConfig } from '../config/peerlyBaseConfig'
import { isAxiosResponse } from '../../shared/util/http.util'
import { format } from '@redtea/format-axios-error'
import { BadGatewayException, Injectable, Logger } from '@nestjs/common'
import { AxiosResponse } from 'axios'
import { Campaign, TcrCompliance, User } from '@prisma/client'
import { CreateTcrComplianceDto } from '../../campaigns/tcrCompliance/schemas/createTcrComplianceDto.schema'
import { getUserFullName } from '../../users/util/users.util'
import {
  Approve10DLCBrandResponse,
  Peerly10DLCBrandSubmitResponseBody,
  PeerlyIdentityCreateResponseBody,
  PeerlySubmitIdentityProfileResponseBody,
} from '../peerly.types'


const PEERLY_ENTITY_TYPE = 'NON_PROFIT'
const PEERLY_USECASE = 'POLITICAL'

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
              identity_name: identityName,
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
            await this.getBaseHttpHeaders(),
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
              sample1: `Hello {first_name}, this is ${getUserFullName(user)} from ${committeeName}. Sample message content. Reply STOP to opt-out`,
              sample2: `Hello {first_name}, this is ${getUserFullName(user)} from ${committeeName}. More sample message content. Reply STOP to opt-out`,
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
}
