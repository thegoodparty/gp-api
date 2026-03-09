import { HttpService } from '@nestjs/axios'
import { BadGatewayException, Injectable } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Timeout } from '@nestjs/schedule'
import { format } from '@redtea/format-axios-error'
import { AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios'
import { Methods } from 'http-constants-ts'
import { PinoLogger } from 'nestjs-pino'
import { lastValueFrom, retry, timer } from 'rxjs'
import { isAxiosResponse } from '@/shared/util/http.util'
import { PeerlyBaseConfig } from '../config/peerlyBaseConfig'
import { PeerlyAuthenticatedUser } from '../peerly.types'

const RETRY_MAX = 3

const { EXPLICITLY_LOG_PEERLY_TOKEN } = process.env

interface DecodedPeerlyToken {
  email: string
  username: string
  user_id: number
  exp: number
}

interface PeerlyAuthenticationResponseBody {
  user: PeerlyAuthenticatedUser
  root_accounts: string[]
  token: string
}

@Injectable()
export class PeerlyHttpService extends PeerlyBaseConfig {
  private token: string | null = null
  private tokenExpiry: number | null = null
  private readonly tokenRenewalThreshold = 5 * 60

  constructor(
    protected readonly logger: PinoLogger,
    private readonly httpService: HttpService,
    private readonly jwtService: JwtService,
  ) {
    super(logger)
  }

  private isRetryableError(error: AxiosError): boolean {
    return error.code === 'ECONNABORTED'
      ? true
      : error.response?.status === 429
        ? true
        : !error.response
          ? error.code !== 'ERR_CANCELED'
          : error.response.status >= 500
  }

  @Timeout(0)
  async authenticate() {
    await this.renewToken()
  }

  async get<T>(
    path: string,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>> {
    return this.request<T>(Methods.GET, path, undefined, config)
  }

  async post<T>(
    path: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>> {
    return this.request<T>(Methods.POST, path, data, config)
  }

  async delete<T>(
    path: string,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>> {
    return this.request<T>(Methods.DELETE, path, undefined, config)
  }

  private async request<T>(
    method: string,
    path: string,
    data: unknown,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>> {
    const mergedConfig = await this.getAuthenticatedConfig(config)
    const url = `${this.baseUrl}${path}`
    this.logRequest(method, url, data, mergedConfig)
    return lastValueFrom(
      this.httpService.request<T>({ ...mergedConfig, method, url, data }).pipe(
        retry({
          count: RETRY_MAX,
          delay: (error: AxiosError, retryCount: number) => {
            if (!this.isRetryableError(error)) throw error
            this.logger.warn(
              {
                retryCount,
                code: error.code,
                status: error.response?.status,
              },
              `Peerly API request retry attempt ${retryCount}`,
            )
            return timer(Math.pow(2, retryCount) * 100)
          },
        }),
      ),
    )
  }

  validateResponse<T>(
    data: unknown,
    dto: { create: (data: unknown) => T },
    context: string,
  ): T {
    try {
      return dto.create(data)
    } catch (error) {
      this.logger.error({ error }, `${context} response validation failed:`)
      throw new BadGatewayException(
        `Invalid ${context} response from Peerly API`,
      )
    }
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

      const { token } = data

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
        { data: isAxiosResponse(error) ? format(error) : error },
        'Failed to renew Peerly token',
      )
      throw new Error('Peerly token renewal failed')
    }
  }

  private async getToken(): Promise<string> {
    if (this.shouldRenewToken()) {
      await this.renewToken()
    }
    if (!this.token) {
      throw new Error('No valid Peerly token available')
    }
    return this.token
  }

  private async getAuthorizationHeader() {
    return { Authorization: `JWT ${await this.getToken()}` }
  }

  private async getAuthenticatedConfig(
    overrides?: AxiosRequestConfig,
  ): Promise<AxiosRequestConfig> {
    const authHeaders = await this.getAuthorizationHeader()
    return {
      timeout: this.httpTimeoutMs,
      ...overrides,
      headers: {
        ...authHeaders,
        ...overrides?.headers,
      },
    }
  }

  private logRequest(
    method: (typeof Methods)[keyof typeof Methods],
    url: string,
    data: unknown,
    config: AxiosRequestConfig,
  ) {
    this.logger.debug(
      {
        data: {
          url,
          method,
          data,
          config,
        },
      },
      'Initializing Peerly HTTP request:',
    )
  }
}
