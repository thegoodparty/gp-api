import { HttpService } from '@nestjs/axios'
import { BadGatewayException, Injectable, Logger } from '@nestjs/common'
import { AxiosResponse } from 'axios'
import { lastValueFrom } from 'rxjs'
import { format } from '@redtea/format-axios-error'
import { isAxiosResponse } from '../../../shared/util/http.util'
import { Domain } from '@prisma/client'
import {
  ForwardEmailAliasResponse,
  ForwardEmailDomainResponse,
} from '../forwardEmail.types'

const FORWARDEMAIL_TIMEOUT_MS = 10000
enum FORWARDEMAIL_PLAN {
  Free = 'free',
  EnhancedProtection = 'enhanced_protection',
  Team = 'team',
}

const { FORWARDEMAIL_API_TOKEN, FORWARDEMAIL_BASE_URL } = process.env

if (!FORWARDEMAIL_BASE_URL) {
  throw new Error('Missing FORWARDEMAIL_BASE_URL config')
}

if (!FORWARDEMAIL_API_TOKEN) {
  throw new Error('Missing FORWARDEMAIL_API_TOKEN config')
}

const forwardEmailApiTokenBase64Encoded: string = Buffer.from(
  `${FORWARDEMAIL_API_TOKEN}:`, // MUST have `:` for basic auth
).toString('base64')

@Injectable()
export class ForwardEmailService {
  private readonly logger = new Logger(ForwardEmailService.name)
  private readonly baseUrl = FORWARDEMAIL_BASE_URL!
  private readonly httpTimeoutMs = FORWARDEMAIL_TIMEOUT_MS

  constructor(private readonly httpService: HttpService) {}

  private handleApiError(error: Error | AxiosResponse | string): never {
    this.logger.error(
      'Failed to communicate with Forward Email API',
      isAxiosResponse(error) ? format(error) : error,
    )
    throw new BadGatewayException(
      'Failed to communicate with Forward Email API',
    )
  }

  private getBaseHttpHeaders(): {
    headers: { Authorization: string }
    timeout: number
  } {
    return {
      headers: { Authorization: `Basic ${forwardEmailApiTokenBase64Encoded}` },
      timeout: this.httpTimeoutMs,
    }
  }

  async addDomain(domain: Domain): Promise<ForwardEmailDomainResponse> {
    try {
      const response: AxiosResponse<ForwardEmailDomainResponse> =
        await lastValueFrom(
          this.httpService.post<ForwardEmailDomainResponse>(
            `${this.baseUrl}/domains`,
            { domain: domain.name, plan: FORWARDEMAIL_PLAN.EnhancedProtection },
            this.getBaseHttpHeaders(),
          ),
        )
      const { data } = response
      this.logger.debug('Successfully created Forward Email domain', data)
      return data
    } catch (error) {
      this.handleApiError(error as Error)
    }
  }

  async createCatchAllAlias(
    forwardToEmail: string,
    forwardingDomainResponse: ForwardEmailDomainResponse,
  ): Promise<ForwardEmailAliasResponse> {
    try {
      const response: AxiosResponse<ForwardEmailAliasResponse> =
        await lastValueFrom(
          this.httpService.post<ForwardEmailAliasResponse>(
            `${this.baseUrl}/domains/${encodeURIComponent(forwardingDomainResponse.id)}/aliases`,
            { name: '*', recipients: forwardToEmail },
            this.getBaseHttpHeaders(),
          ),
        )
      const { data } = response
      this.logger.debug(
        'Successfully created Forward Email catch-all alias',
        data,
      )
      return data
    } catch (error) {
      this.handleApiError(error as Error)
    }
  }
}
