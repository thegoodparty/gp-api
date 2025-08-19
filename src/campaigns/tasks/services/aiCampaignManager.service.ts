import { HttpService } from '@nestjs/axios'
import { BadGatewayException, Injectable, Logger } from '@nestjs/common'
import { lastValueFrom } from 'rxjs'
import { Methods } from 'http-constants-ts'
import { AxiosResponse } from 'axios'

export interface StartCampaignPlanRequest {
  candidate_name: string
  election_date: string
  office_and_jurisdiction: string
  race_type: string
  incumbent_status: string
  seats_available: number
  number_of_opponents: number
  win_number: number
  total_likely_voters: number
  available_cell_phones: number
  available_landlines: number
  primary_date?: string | null
  additional_race_context?: string | null
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
  private readonly apiBaseUrl: string | undefined
  private readonly logger = new Logger(AiCampaignManagerService.name)

  constructor(private readonly httpService: HttpService) {
    this.apiBaseUrl = process.env.AI_CAMPAIGN_MANAGER_BASE
  }

  async startCampaignPlanGeneration(
    request: StartCampaignPlanRequest,
  ): Promise<CampaignPlanSession> {
    try {
      console.log('request', request)
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

      let requestData = data
      const config = {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          ...headers,
        },
      }

      if (method === Methods.POST && data && typeof data === 'object') {
        const params = new URLSearchParams()
        Object.keys(data).forEach((key) => {
          if (data[key] !== null && data[key] !== undefined) {
            params.append(key, String(data[key]))
          }
        })
        requestData = params.toString()
        this.logger.debug('URL-encoded request data:', requestData)
      }

      let response: AxiosResponse<T>
      switch (method) {
        case Methods.POST:
          response = await lastValueFrom(
            this.httpService.post(url, requestData, config),
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
