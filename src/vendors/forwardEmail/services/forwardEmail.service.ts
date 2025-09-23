import { HttpService } from '@nestjs/axios'
import { BadGatewayException, Injectable, Logger } from '@nestjs/common'
import { AxiosResponse, isAxiosError } from 'axios'
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

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  private async paginateWithBackoff<T>(
    requester: (page: number, limit: number) => Promise<AxiosResponse<T[]>>,
  ): Promise<T[]> {
    const all: T[] = []
    const limit = 1000
    let page = 1
    let backoff = 250
    const maxBackoff = 8000
    const maxRetries = 5
    try {
      let hasMore = true
      while (hasMore) {
        let response: AxiosResponse<T[]> | null = null
        let attempt = 0
        let pending = true
        while (pending) {
          try {
            response = await requester(page, limit)
            pending = false
          } catch (e) {
            if (
              isAxiosError(e) &&
              e.response?.status === 429 &&
              attempt < maxRetries
            ) {
              await this.sleep(backoff)
              backoff = Math.min(backoff * 2, maxBackoff)
              attempt += 1
            } else {
              this.handleApiError(e as Error)
            }
          }
        }
        const data = response!.data
        all.push(...data)
        const pageCount = Number(response!.headers['x-page-count'])
        const pageCurrent = Number(response!.headers['x-page-current'])
        const hasHeaderPagination =
          Number.isFinite(pageCount) &&
          Number.isFinite(pageCurrent) &&
          pageCurrent < pageCount
        hasMore = hasHeaderPagination || data.length === limit
        if (hasMore) {
          page += 1
          await this.sleep(backoff)
          backoff = Math.min(backoff * 2, maxBackoff)
        }
      }
      return all
    } catch (error) {
      this.handleApiError(error as Error)
    }
  }

  private async listDomains(): Promise<ForwardEmailDomainResponse[]> {
    const domains = await this.paginateWithBackoff<ForwardEmailDomainResponse>(
      (p, l) =>
        lastValueFrom(
          this.httpService.get<ForwardEmailDomainResponse[]>(
            `${this.baseUrl}/domains`,
            {
              ...this.getBaseHttpHeaders(),
              params: { page: p, limit: l, paginate: true, pagination: true },
            },
          ),
        ),
    )
    this.logger.debug(
      `Successfully retrieved (${domains?.length}) Forward Email domains`,
    )
    return domains
  }

  async getDomain(
    domainName: string,
  ): Promise<ForwardEmailDomainResponse | null> {
    const domains = await this.listDomains()
    return domains.find((d) => d.name === domainName) || null
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

  async getCatchAllDomainAliases(
    domainName: string,
  ): Promise<ForwardEmailAliasResponse[]> {
    const aliases = await this.paginateWithBackoff<ForwardEmailAliasResponse>(
      (p, l) =>
        lastValueFrom(
          this.httpService.get<ForwardEmailAliasResponse[]>(
            `${this.baseUrl}/domains/${encodeURIComponent(domainName)}/aliases`,
            {
              ...this.getBaseHttpHeaders(),
              params: {
                page: p,
                limit: l,
                paginate: true,
                pagination: true,
                name: '*',
              },
            },
          ),
        ),
    )
    this.logger.debug(
      'Successfully retrieved Forward Email catch-all aliases',
      aliases,
    )
    return aliases
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
        `Successfully created Forward Email catch-all alias: ${JSON.stringify(data)}`,
      )
      return data
    } catch (error) {
      this.handleApiError(error as Error)
    }
  }

  async updateDomainAlias(
    aliasId: string,
    forwardToEmail: string,
    forwardingDomainResponse: ForwardEmailDomainResponse,
  ): Promise<ForwardEmailAliasResponse> {
    try {
      const response: AxiosResponse<ForwardEmailAliasResponse> =
        await lastValueFrom(
          this.httpService.put<ForwardEmailAliasResponse>(
            `${this.baseUrl}/domains/${encodeURIComponent(forwardingDomainResponse.id)}/aliases/${encodeURIComponent(aliasId)}`,
            { recipients: forwardToEmail },
            this.getBaseHttpHeaders(),
          ),
        )

      const { data } = response
      this.logger.debug(
        `Successfully updated Forward Email catch-all alias: ${JSON.stringify(data)}`,
      )
      return data
    } catch (error) {
      this.handleApiError(error as Error)
    }
  }
}
