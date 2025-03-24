// Documentation URL: https://rumbleup.com/api

import { HttpService } from '@nestjs/axios'
import { BadGatewayException, Injectable, Logger } from '@nestjs/common'
import { lastValueFrom } from 'rxjs'
import {
  ApiRumbleUpProject,
  ApiRumbleUpResponse,
  PaginationParams,
} from '../textCampaign.types'
import { Methods } from 'http-constants-ts'
import { AxiosResponse } from 'axios'
import { createReadStream } from 'fs'
import FormData from 'form-data'

@Injectable()
export class RumbleUpService {
  private readonly apiBaseUrl = 'https://app.rumbleup.com/api'
  private readonly logger = new Logger(RumbleUpService.name)
  private readonly accountId: string
  private readonly apiKey: string

  constructor(private readonly httpService: HttpService) {
    this.accountId = process.env.RUMBLE_APP_ACCOUNT_ID!
    this.apiKey = process.env.RUMBLE_APP_API_KEY!

    if (!this.accountId || !this.apiKey) {
      throw new Error('RumbleUp credentials not properly configured')
    }
  }

  async createProject(
    project: ApiRumbleUpProject,
  ): Promise<ApiRumbleUpResponse> {
    try {
      const response = await this.fetchFromApi<ApiRumbleUpResponse>(
        '/action/create',
        {
          method: Methods.POST,
          data: project,
        },
      )

      return response
    } catch (error) {
      this.logger.error('Failed to create project', error)
      throw new BadGatewayException('Failed to create project in RumbleUp')
    }
  }

  /**
   * Upload a CSV file of contacts to RumbleUp and get the contact group ID
   * @param csvFileOrBuffer Path to the CSV file on disk, or Buffer containing CSV data
   * @param fileName Optional name for the file if providing a Buffer
   * @returns The contact group ID that can be used for creating projects
   */
  async uploadContactsAndGetGroupId(
    csvFileOrBuffer: string | Buffer,
    fileName = 'contacts.csv',
  ): Promise<string> {
    const form = new FormData()

    if (typeof csvFileOrBuffer === 'string') {
      // If a file path is provided
      form.append('files', createReadStream(csvFileOrBuffer), fileName)
    } else {
      // If a buffer is provided
      form.append('files', csvFileOrBuffer, fileName)
    }

    try {
      const response = await this.httpService.axiosRef.post(
        `${this.apiBaseUrl}/contact-import`,
        form,
        {
          headers: {
            ...form.getHeaders(),
            'X-Api-Token': `${this.accountId}:${this.apiKey}`,
          },
        },
      )

      const responseData = response.data

      if (!responseData.success) {
        throw new Error(
          `Failed to upload contacts: ${responseData.error || responseData.message}`,
        )
      }

      // Extract the group ID from the response data according to the API documentation
      const groupId = responseData.data?.gid || responseData.gid

      if (!groupId) {
        throw new Error('Failed to get group ID from response')
      }

      return groupId
    } catch (error: any) {
      this.logger.error(
        `Error uploading contacts to RumbleUp: ${error.message}`,
        error.stack,
      )
      throw new Error(`Failed to upload contacts: ${error.message}`)
    }
  }

  // Add other API methods here as needed

  private async fetchFromApi<T>(
    endpoint: string,
    options: {
      method?: Methods
      data?: any
      params?: PaginationParams
    } = {},
  ): Promise<T> {
    try {
      const { method = Methods.GET, data, params = {} } = options
      const queryParams = new URLSearchParams()

      if (params.limit) {
        queryParams.append('limit', params.limit.toString())
      }
      if (params.order) {
        queryParams.append('order', params.order)
      }
      if (params.page) {
        queryParams.append('page', params.page.toString())
      }
      if (params.offset) {
        queryParams.append('offset', params.offset.toString())
      }

      const url = `${this.apiBaseUrl}${endpoint}${
        queryParams.toString() ? `?${queryParams.toString()}` : ''
      }`

      // RumbleUp uses Basic auth with account ID as username and API key as password
      const auth = Buffer.from(`${this.accountId}:${this.apiKey}`).toString(
        'base64',
      )
      const config = {
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
      }

      let response: AxiosResponse<T>
      switch (method) {
        case Methods.POST:
          response = await lastValueFrom(
            this.httpService.post(url, data, config),
          )
          break
        case Methods.PUT:
          response = await lastValueFrom(
            this.httpService.put(url, data, config),
          )
          break
        case Methods.DELETE:
          response = await lastValueFrom(this.httpService.delete(url, config))
          break
        default:
          response = await lastValueFrom(this.httpService.get(url, config))
      }

      return response.data
    } catch (error: any) {
      this.logger.error(
        `Failed to ${options.method || Methods.GET} ${endpoint}`,
        error.response?.data || error.message,
      )

      if (error.response?.status === 401) {
        throw new BadGatewayException(
          'Unauthorized: Invalid RumbleUp credentials',
        )
      }
      if (error.response?.status === 429) {
        throw new BadGatewayException('Too many requests to RumbleUp API')
      }

      throw new BadGatewayException(
        `Failed to communicate with RumbleUp API: ${error.response?.data?.message || error.message}`,
      )
    }
  }
}
