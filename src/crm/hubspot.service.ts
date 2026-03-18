import { Injectable } from '@nestjs/common'
import { Client } from '@hubspot/api-client'
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

  constructor() {
    this._client = new Client({ accessToken: HUBSPOT_TOKEN })
  }

  private isTokenAvailable(): boolean {
    return !!HUBSPOT_TOKEN
  }

  get client(): Client {
    return this.isTokenAvailable()
      ? this._client
      // Incompatible types require double assertion — no shared base type exists
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      : (this.createMockClient() as unknown as Client)
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
      init: () => undefined,
      setAccessToken: () => undefined,
      setApiKey: () => undefined,
      setDeveloperApiKey: () => undefined,
      // HubSpot SDK types are loosely typed — properties bag is Record<string, string>
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      apiRequest: () => Promise.resolve({} as Response),
    }
  }
}
