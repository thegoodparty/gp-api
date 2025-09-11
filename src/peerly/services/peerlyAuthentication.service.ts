import { HttpService } from '@nestjs/axios'
import { Injectable } from '@nestjs/common'
import { Timeout } from '@nestjs/schedule'
import { lastValueFrom } from 'rxjs'
import { format } from '@redtea/format-axios-error'
import { isAxiosResponse } from '../../shared/util/http.util'
import { JwtService } from '@nestjs/jwt'
import { PeerlyBaseConfig } from '../config/peerlyBaseConfig'
import { AxiosResponse } from 'axios'

const { EXPLICITLY_LOG_PEERLY_TOKEN } = process.env

interface DecodedPeerlyToken {
  email: string
  username: string
  user_id: number
  exp: number
}

export interface PeerlyAuthenticatedUser {
  user_id: number
  last_name: string
  email: string
  user_type: string
  identities: any[]
  first_name: string
  local_timezone: string
}

interface PeerlyAuthenticationResponseBody {
  user: PeerlyAuthenticatedUser
  root_accounts: string[]
  token: string
}

@Injectable()
export class PeerlyAuthenticationService extends PeerlyBaseConfig {
  private authenticatedUser: PeerlyAuthenticatedUser | null = null
  private token: string | null = null
  private tokenExpiry: number | null = null
  private readonly tokenRenewalThreshold = 5 * 60 // 5 minutes in seconds

  constructor(
    private readonly httpService: HttpService,
    private readonly jwtService: JwtService,
  ) {
    super()
  }

  private shouldRenewToken(): boolean {
    return Boolean(
      !this.token ||
        !this.tokenExpiry ||
        this.tokenExpiry - Math.floor(Date.now() / 1000) <=
          this.tokenRenewalThreshold,
    )
  }

  private async renewToken(): Promise<void> {
    try {
      const response: AxiosResponse<PeerlyAuthenticationResponseBody> =
        await lastValueFrom(
          this.httpService.post(`${this.baseUrl}/token-auth`, {
            email: this.email,
            password: this.password,
          }),
        )
      const { data } = response
      if (!data) {
        this.logger.error('No data received from Peerly token-auth endpoint')
        throw new Error('Peerly token renewal failed: No data received')
      }

      const { token, user } = data
      this.authenticatedUser = user

      if (token) {
        const decodedToken: DecodedPeerlyToken = this.jwtService.decode(token)
        if (
          decodedToken &&
          typeof decodedToken === 'object' &&
          'exp' in decodedToken
        ) {
          this.token = token
          this.tokenExpiry = decodedToken.exp as number
          this.logger.debug(
            `Successfully renewed Peerly token${
              EXPLICITLY_LOG_PEERLY_TOKEN === 'true' ? ` => ${this.token}` : ''
            }`,
          )
        } else {
          this.logger.error('Token renewal response did not contain expiry')
          throw new Error('Peerly token renewal failed: No expiry received')
        }
      } else {
        this.logger.error('Token renewal response did not contain a token')
        throw new Error('Peerly token renewal failed: No token received')
      }
    } catch (error) {
      this.logger.error(
        'Failed to renew Peerly token',
        isAxiosResponse(error) ? format(error) : error,
      )
      throw new Error('Peerly token renewal failed')
    }
  }

  async getToken(): Promise<string> {
    if (this.shouldRenewToken()) {
      await this.renewToken()
    }
    if (!this.token) {
      throw new Error('No valid Peerly token available')
    }
    return this.token
  }

  getAuthenticatedUser(): PeerlyAuthenticatedUser | null {
    return this.authenticatedUser
  }

  // Initial authentication on service startup
  @Timeout(0)
  async authenticate() {
    await this.renewToken()
  }

  async getAuthorizationHeader() {
    return { Authorization: `JWT ${await this.getToken()}` }
  }
}
