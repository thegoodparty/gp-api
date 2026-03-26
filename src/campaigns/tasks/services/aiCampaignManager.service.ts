import { HttpService } from '@nestjs/axios'
import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common'
import { lastValueFrom } from 'rxjs'
import {
  StartCampaignPlanRequest,
  CampaignPlanSession,
  ProgressStreamData,
  CampaignPlanResponse,
} from '../aiCampaignManager.types'
import { sleep } from 'src/shared/util/sleep.util'
import { isAxiosError } from 'axios'

export {
  StartCampaignPlanRequest,
  CampaignPlanSession,
  ProgressStreamData,
  CampaignPlanResponse,
  CampaignPlanTask,
  CampaignPlanTaskMetadata,
} from '../aiCampaignManager.types'

const VALID_SESSION_ID_PATTERN = /^[\w-]+$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isProgressStreamData(value: unknown): value is ProgressStreamData {
  if (!isRecord(value)) return false
  return (
    typeof value.progress === 'number' &&
    typeof value.status === 'string' &&
    (value.status === 'processing' ||
      value.status === 'completed' ||
      value.status === 'failed') &&
    typeof value.message === 'string'
  )
}

@Injectable()
export class AiCampaignManagerService {
  private readonly apiBaseUrl: string
  private readonly logger = new Logger(AiCampaignManagerService.name)

  constructor(private readonly httpService: HttpService) {
    const baseUrl = process.env.AI_CAMPAIGN_MANAGER_BASE
    if (!baseUrl) {
      throw new Error(
        'AI_CAMPAIGN_MANAGER_BASE environment variable is required',
      )
    }
    this.apiBaseUrl = baseUrl
  }

  private validateSessionId(sessionId: string): void {
    if (!VALID_SESSION_ID_PATTERN.test(sessionId)) {
      throw new BadRequestException('Invalid session ID format')
    }
  }

  async startCampaignPlanGeneration(
    request: StartCampaignPlanRequest,
  ): Promise<CampaignPlanSession> {
    const url = `${this.apiBaseUrl}/start-campaign-plan-generation`

    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(request)) {
      if (value !== null && value !== undefined) {
        params.append(key, String(value))
      }
    }
    const requestData = params.toString()
    this.logger.debug(
      `Starting campaign plan generation: url=${url} body=${requestData}`,
    )
    try {
      const response = await lastValueFrom(
        this.httpService.post<CampaignPlanSession>(url, requestData, {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }),
      )
      return response.data
    } catch (error) {
      if (isAxiosError(error)) {
        this.logger.error(
          `Failed to start campaign plan generation: status=${error.response?.status} body=${JSON.stringify(error.response?.data)} message=${error.message}`,
        )
      } else {
        this.logger.error(
          `Failed to start campaign plan generation: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
      throw new BadGatewayException('Failed to start campaign plan generation')
    }
  }

  async downloadJson(sessionId: string): Promise<CampaignPlanResponse> {
    this.validateSessionId(sessionId)
    const url = `${this.apiBaseUrl}/download-json/${sessionId}`

    try {
      const response = await lastValueFrom(
        this.httpService.get<CampaignPlanResponse>(url),
      )
      return response.data
    } catch (error) {
      if (isAxiosError(error)) {
        this.logger.error(
          `Failed to download campaign plan JSON: status=${error.response?.status} body=${JSON.stringify(error.response?.data)} message=${error.message}`,
        )
      } else {
        this.logger.error(
          `Failed to download campaign plan JSON: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
      throw new BadGatewayException('Failed to download campaign plan JSON')
    }
  }

  async getProgressStream(sessionId: string): Promise<ProgressStreamData[]> {
    this.validateSessionId(sessionId)
    const url = `${this.apiBaseUrl}/progress-stream/${sessionId}`

    try {
      const response = await lastValueFrom(this.httpService.get<string>(url))

      const lines = response.data
        .split('\n')
        .filter((line) => line.startsWith('data: '))
      const progressData: ProgressStreamData[] = []

      for (const line of lines) {
        try {
          const jsonStr = line.replace('data: ', '')
          const parsed: unknown = JSON.parse(jsonStr)
          if (isProgressStreamData(parsed)) {
            progressData.push(parsed)
          }
        } catch (parseError) {
          this.logger.warn('Failed to parse progress line', {
            line,
            parseError,
          })
        }
      }

      return progressData
    } catch (error: unknown) {
      if (isAxiosError(error)) {
        this.logger.error(
          `Failed to get progress stream: status=${error.response?.status} body=${JSON.stringify(error.response?.data)} message=${error.message}`,
        )
      } else {
        this.logger.error(
          `Failed to get progress stream: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
      throw new BadGatewayException('Failed to get progress stream')
    }
  }

  async waitForCompletion(
    sessionId: string,
    maxWaitTimeMs = 300000,
    pollIntervalMs = 5000,
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

      await sleep(pollIntervalMs)
    }

    throw new BadGatewayException('Campaign plan generation timed out')
  }
}
