import { HttpService } from '@nestjs/axios'
import { BadGatewayException, Injectable, Logger } from '@nestjs/common'
import { lastValueFrom } from 'rxjs'
import { Methods } from 'http-constants-ts'
import { AxiosResponse } from 'axios'

export interface StartCampaignPlanRequest {
  candidate_name: string
  office: string
  state: string
  party?: string
  district?: string
  election_date: string
  budget?: number
  experience?: string
  key_issues?: string[]
  target_demographics?: string[]
  campaign_goals?: string[]
}

export interface CampaignPlanSession {
  session_id: string
}

export interface ProgressStreamData {
  progress: number
  status: 'processing' | 'completed' | 'failed'
  message: string
  logs: string[]
  timestamp: string
  has_pdf: boolean
  has_json: boolean
  download_links: {
    pdf?: string
    json?: string
  }
  expires_at: string | null
  expires_at_formatted: string | null
  files_ready: {
    pdf: boolean
    json: boolean
    total: number
  }
}

@Injectable()
export class AiCampaignManagerService {
  private readonly apiBaseUrl: string
  private readonly logger = new Logger(AiCampaignManagerService.name)

  constructor(private readonly httpService: HttpService) {
    this.apiBaseUrl =
      process.env.AI_CAMPAIGN_MANAGER_BASE || 'http://34.221.9.248:8000'
  }

  async startCampaignPlanGeneration(
    request: StartCampaignPlanRequest,
  ): Promise<CampaignPlanSession> {
    try {
      const response = await this.fetchFromApi<CampaignPlanSession>(
        '/start-campaign-plan-generation',
        {
          method: Methods.POST,
          data: request,
        },
      )

      return response.data
    } catch (error) {
      this.logger.error('Failed to start campaign plan generation', error)
      throw new BadGatewayException('Failed to start campaign plan generation')
    }
  }

  async downloadJson(sessionId: string): Promise<unknown> {
    try {
      const response = await this.fetchFromApi(`/download-json/${sessionId}`, {
        method: Methods.GET,
      })

      return response.data
    } catch (error) {
      this.logger.error('Failed to download campaign plan JSON', error)
      throw new BadGatewayException('Failed to download campaign plan JSON')
    }
  }

  async getProgressStream(sessionId: string): Promise<ProgressStreamData[]> {
    try {
      const response = await this.fetchFromApi<string>(
        `/progress-stream/${sessionId}`,
        {
          method: Methods.GET,
        },
      )

      const lines = response.data
        .split('\n')
        .filter((line) => line.startsWith('data: '))
      const progressData: ProgressStreamData[] = []

      for (const line of lines) {
        try {
          const jsonStr = line.replace('data: ', '')
          const data = JSON.parse(jsonStr) as ProgressStreamData
          progressData.push(data)
        } catch (parseError) {
          this.logger.warn('Failed to parse progress line', {
            line,
            parseError,
          })
        }
      }

      return progressData
    } catch (error) {
      this.logger.error('Failed to get progress stream', error)
      throw new BadGatewayException('Failed to get progress stream')
    }
  }

  async waitForCompletion(
    sessionId: string,
    maxWaitTimeMs = 300000, // 5 minutes default
    pollIntervalMs = 5000, // 5 seconds default
  ): Promise<ProgressStreamData> {
    const startTime = Date.now()

    while (Date.now() - startTime < maxWaitTimeMs) {
      const progressData = await this.getProgressStream(sessionId)
      const latestProgress = progressData[progressData.length - 1]

      if (latestProgress?.status === 'completed') {
        return latestProgress
      }

      if (latestProgress?.status === 'failed') {
        throw new BadGatewayException('Campaign plan generation failed')
      }

      await this.sleep(pollIntervalMs)
    }

    throw new BadGatewayException('Campaign plan generation timed out')
  }

  private async fetchFromApi<T>(
    endpoint: string,
    options: {
      method?: Methods
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data?: any
      headers?: Record<string, string>
    } = {},
  ): Promise<AxiosResponse<T>> {
    try {
      const { method = Methods.GET, data, headers = {} } = options
      const url = `${this.apiBaseUrl}${endpoint}`

      const config = {
        headers: {
          'Content-Type': 'application/json',
          ...headers,
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

      return response
    } catch (error) {
      this.logger.error(
        `Failed to ${options.method || Methods.GET} ${endpoint}`,
        error,
      )
      throw new BadGatewayException(
        'Failed to communicate with AI Campaign Manager API',
      )
    }
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
