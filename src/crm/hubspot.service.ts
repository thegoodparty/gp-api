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
    // Bottleneck handles this as 19 requests per second with a reservoir of 190
    this._rateLimiter = new Bottleneck({
      reservoir: 190,
      reservoirRefreshAmount: 190,
      reservoirRefreshInterval: 10 * 1000, // 10 seconds in milliseconds
      maxConcurrent: 1,
      minTime: 1000 / 19, // 1 second / 19 requests = ~52.6ms between requests
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
