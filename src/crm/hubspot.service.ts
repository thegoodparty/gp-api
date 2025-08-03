import { Injectable } from '@nestjs/common'
import { Client } from '@hubspot/api-client'
const { HUBSPOT_TOKEN } = process.env

@Injectable()
export class HubspotService {
  private _client: Client

  constructor() {
    this._client = new Client({ accessToken: HUBSPOT_TOKEN })
  }

  private isTokenAvailable(): boolean {
    return !!HUBSPOT_TOKEN
  }

  get client(): Client {
    return this.isTokenAvailable() ? this._client : this.createMockClient()
  }

  private createMockClient(): Client {
    const mockResponse = () => Promise.resolve(undefined)
    const mockApi = {
      getById: mockResponse,
      create: mockResponse,
      update: mockResponse,
      doSearch: mockResponse,
    }
    const mockBatchApi = {
      create: mockResponse,
      update: mockResponse,
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
    } as any
  }
}
