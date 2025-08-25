import { HttpService } from '@nestjs/axios'
import { BadGatewayException, Injectable, Logger } from '@nestjs/common'
import { lastValueFrom } from 'rxjs'
import {
  StartCampaignPlanRequest,
  CampaignPlanSession,
  ProgressStreamData,
  CampaignPlanResponse,
} from '../aiCampaignManager.types'

export {
  StartCampaignPlanRequest,
  CampaignPlanSession,
  ProgressStreamData,
  CampaignPlanResponse,
  CampaignPlanTask,
  CampaignPlanSections,
  CampaignPlanTasks,
  CampaignPlanMetadata,
} from '../aiCampaignManager.types'

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
    const url = `${this.apiBaseUrl}/start-campaign-plan-generation`

    const params = new URLSearchParams()
    Object.keys(request).forEach((key) => {
      if (request[key] !== null && request[key] !== undefined) {
        params.append(key, String(request[key]))
      }
    })
    const requestData = params.toString()

    try {
      const response = await lastValueFrom(
        this.httpService.post<CampaignPlanSession>(url, requestData, {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }),
      )
      return response.data
    } catch (error) {
      this.logger.error('Failed to start campaign plan generation', error)
      throw new BadGatewayException('Failed to start campaign plan generation')
    }
  }

  async downloadJson(sessionId: string): Promise<CampaignPlanResponse> {
    const url = `${this.apiBaseUrl}/download-json/${sessionId}`

    try {
      const response = await lastValueFrom(
        this.httpService.get<CampaignPlanResponse>(url),
      )
      return response.data
    } catch (error: unknown) {
      this.logger.error('Failed to download campaign plan JSON', error)
      throw new BadGatewayException('Failed to download campaign plan JSON')
    }
  }

  async getProgressStream(sessionId: string): Promise<ProgressStreamData[]> {
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
    } catch (error: unknown) {
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

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
