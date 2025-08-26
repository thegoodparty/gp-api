import { Injectable } from '@nestjs/common'
import { Client } from '@hubspot/api-client'
import Bottleneck from 'bottleneck'
import {
  MockApi,
  MockBaseDiscovery,
  MockBatchApi,
  MockHubspotClient,
} from './crm.types'

const { HUBSPOT_TOKEN } = process.env

@Injectable()
export class HubspotService {
  private readonly _client: Client
  private readonly _rateLimiter: Bottleneck

  constructor() {
    this._client = new Client({ accessToken: HUBSPOT_TOKEN })

    // HubSpot rate limit: 190 requests per 10 seconds (rolling window)
    // Configuration can be customized via environment variables
    this._rateLimiter = new Bottleneck({
      maxConcurrent: parseInt(process.env.HUBSPOT_MAX_CONCURRENT ?? '5'),
      minTime: parseInt(process.env.HUBSPOT_MIN_TIME ?? '100'),
      reservoir: parseInt(process.env.HUBSPOT_RESERVOIR ?? '190'),
      reservoirRefreshAmount: parseInt(
        process.env.HUBSPOT_RESERVOIR_REFRESH_AMOUNT ?? '190',
      ),
      reservoirRefreshInterval: parseInt(
        process.env.HUBSPOT_RESERVOIR_REFRESH_INTERVAL ?? '10000',
      ), // 10 seconds
    })
  }

  private isTokenAvailable(): boolean {
    return !!HUBSPOT_TOKEN
  }

  get client(): Client {
    return this.isTokenAvailable()
      ? this._client
      : (this.createMockClient() as unknown as Client)
  }

  async throttleRequest<T>(apiCall: () => Promise<T>): Promise<T> {
    return this._rateLimiter.schedule(() => apiCall())
  }

  async throttleRequestWithPriority<T>(
    apiCall: () => Promise<T>,
    priority: number = 5,
  ): Promise<T> {
    return this._rateLimiter.schedule({ priority }, () => apiCall())
  }

  async throttleRequestWithRetry<T>(
    apiCall: () => Promise<T>,
    retries: number = 3,
  ): Promise<T> {
    if (retries <= 0) {
      return this._rateLimiter.schedule(() => apiCall())
    }

    let lastError: Error
    for (let i = 0; i < retries; i++) {
      try {
        return await this._rateLimiter.schedule(() => apiCall())
      } catch (error) {
        lastError = error as Error
        if (i === retries - 1) throw lastError
        // Wait before retry
        await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)))
      }
    }
    throw lastError!
  }

  getRateLimiterStats() {
    return {
      running: this._rateLimiter.running(),
      queued: this._rateLimiter.queued(),
      done: this._rateLimiter.done(),
      count: this._rateLimiter.counts(),
    }
  }

  get rateLimiter(): Bottleneck {
    return this._rateLimiter
  }

  private createMockClient(): MockHubspotClient {
    const mockResponse = () => Promise.resolve(undefined)
    const mockApi: MockApi = {
      getById: mockResponse,
      create: mockResponse,
      update: mockResponse,
      doSearch: mockResponse,
    }
    const mockBatchApi: MockBatchApi = {
      create: mockResponse,
      update: mockResponse,
    }

    const mockBaseDiscovery: MockBaseDiscovery = {
      config: { accessToken: null },
    }

    return {
      config: { accessToken: null },
      crm: {
        companies: {
          basicApi: mockApi,
          batchApi: mockBatchApi,
        },
        contacts: {
          basicApi: mockApi,
          searchApi: mockApi,
        },
        owners: {
          ownersApi: mockApi,
        },
        associations: {
          v4: {
            batchApi: mockBatchApi,
          },
        },
      },
      automation: {
        ...mockBaseDiscovery,
        actions: mockBaseDiscovery,
      },
      cms: {
        ...mockBaseDiscovery,
        auditLogs: mockBaseDiscovery,
        blogs: mockBaseDiscovery,
        domains: mockBaseDiscovery,
        hubdb: mockBaseDiscovery,
        pages: mockBaseDiscovery,
        performance: mockBaseDiscovery,
        siteSearch: mockBaseDiscovery,
        sourceCode: mockBaseDiscovery,
        urlRedirects: mockBaseDiscovery,
      },
      communicationPreferences: mockBaseDiscovery,
      conversations: mockBaseDiscovery,
      events: mockBaseDiscovery,
      files: mockBaseDiscovery,
      marketing: mockBaseDiscovery,
      oauth: mockBaseDiscovery,
      settings: mockBaseDiscovery,
      webhooks: mockBaseDiscovery,
      init: () => {},
      setAccessToken: () => {},
      setApiKey: () => {},
      setDeveloperApiKey: () => {},
      apiRequest: () => Promise.resolve({} as Response),
    }
  }
}
