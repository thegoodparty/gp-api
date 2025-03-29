// Documentation URL: https://app.rumbleup.com/app/docs/api

import { HttpService } from '@nestjs/axios'
import { BadGatewayException, Injectable, Logger } from '@nestjs/common'
import { lastValueFrom } from 'rxjs'
import { ApiRumbleUpProject, ApiRumbleUpResponse } from '../textCampaign.types'
import { Headers, MimeTypes } from 'http-constants-ts'

@Injectable()
export class RumbleUpService {
  private readonly apiBaseUrl = 'https://app.rumbleup.com/api'
  private readonly logger = new Logger(RumbleUpService.name)
  private readonly accountId: string = process.env.RUMBLE_APP_ACCOUNT_ID!
  private readonly apiKey: string = process.env.RUMBLE_APP_API_KEY!

  private readonly serviceHttpConfig = {
    headers: {
      [Headers.AUTHORIZATION]: `Basic ${Buffer.from(`${this.accountId}:${this.apiKey}`).toString('base64')}`,
      [Headers.CONTENT_TYPE]: MimeTypes.APPLICATION_JSON,
    },
  }

  constructor(private readonly httpService: HttpService) {
    if (!this.accountId || !this.apiKey) {
      throw new Error('RumbleUp credentials not properly configured')
    }
  }

  async createProject(
    project: ApiRumbleUpProject,
  ): Promise<ApiRumbleUpResponse> {
    try {
      const response = await lastValueFrom(
        this.httpService.post(
          `${this.apiBaseUrl}/action/create`,
          project,
          this.serviceHttpConfig,
        ),
      )
      return response.data
    } catch (error: any) {
      this.handleResponseException(error)
    }
  }

  private handleResponseException(error: any): never {
    this.logger.error(
      `Failed to make request to RumbleUp API`,
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
