import { PeerlyAuthenticationService } from './peerlyAuthentication.service'
import { HttpService } from '@nestjs/axios'
import { lastValueFrom } from 'rxjs'
import { PeerlyBaseConfig } from '../config/peerlyBaseConfig'
import { isAxiosResponse } from '../../shared/util/http.util'
import { format } from '@redtea/format-axios-error'
import { BadGatewayException, Injectable, Logger } from '@nestjs/common'
import { AxiosResponse } from 'axios'

type PeerlyIdentityCreateResponseBody = {
  Data: {
    identity_id: string
    identity_name: string
    start_date: string
    account_id: string
    tcr_identity_status: string | null
  }
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
              usecases: ['POLITICAL'],
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
}
