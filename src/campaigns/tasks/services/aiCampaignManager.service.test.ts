import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AiCampaignManagerService } from './aiCampaignManager.service'
import { HttpService } from '@nestjs/axios'
import { BadGatewayException } from '@nestjs/common'
import { of, throwError } from 'rxjs'
import { AxiosResponse } from 'axios'
import { StartCampaignPlanRequest } from '../aiCampaignManager.types'

const mockHttpService: Partial<HttpService> = {
  post: vi.fn(),
  get: vi.fn(),
}

const makeAxiosResponse = <T>(data: T): AxiosResponse<T> =>
  ({
    data,
    status: 200,
    statusText: 'OK',
    headers: {},
    config: {} as AxiosResponse['config'],
  }) as AxiosResponse<T>

const makeRequest = (
  overrides: Partial<StartCampaignPlanRequest> = {},
): StartCampaignPlanRequest => ({
  candidate_name: 'Jane Doe',
  election_date: '2025-11-04',
  office_and_jurisdiction: 'City Council in California',
  race_type: 'Nonpartisan',
  incumbent_status: 'N/A',
  seats_available: 1,
  number_of_opponents: 1,
  win_number: 500,
  total_likely_voters: 1800,
  available_cell_phones: 1260,
  available_landlines: 540,
  ...overrides,
})

describe('AiCampaignManagerService', () => {
  let service: AiCampaignManagerService

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('AI_CAMPAIGN_MANAGER_BASE', 'http://ai-service')
    service = new AiCampaignManagerService(mockHttpService as HttpService)
  })

  describe('startCampaignPlanGeneration', () => {
    it('posts form-encoded data and returns session', async () => {
      const session = { session_id: 'session-abc' }
      vi.mocked(mockHttpService.post!).mockReturnValue(
        of(makeAxiosResponse(session)),
      )

      const result = await service.startCampaignPlanGeneration(makeRequest())

      expect(result).toEqual(session)
      expect(mockHttpService.post).toHaveBeenCalledWith(
        'http://ai-service/start-campaign-plan-generation',
        expect.any(String),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      )
    })

    it('sends all non-null request fields as URL params', async () => {
      vi.mocked(mockHttpService.post!).mockReturnValue(
        of(makeAxiosResponse({ session_id: 's' })),
      )

      await service.startCampaignPlanGeneration(
        makeRequest({ primary_date: null }),
      )

      const body = vi.mocked(mockHttpService.post!).mock.calls[0][1] as string
      expect(body).toContain('candidate_name=Jane+Doe')
      expect(body).toContain('win_number=500')
      expect(body).not.toContain('primary_date')
    })

    it('throws BadGatewayException on HTTP error', async () => {
      vi.mocked(mockHttpService.post!).mockReturnValue(
        throwError(() => new Error('Network error')),
      )

      await expect(
        service.startCampaignPlanGeneration(makeRequest()),
      ).rejects.toThrow(BadGatewayException)
    })
  })

  describe('downloadJson', () => {
    it('fetches and returns plan JSON', async () => {
      const planJson = {
        campaign_plan: 'A plan',
        candidate_name: 'Jane',
        election_date: '2025-11-04',
        office_and_jurisdiction: 'Council',
        generation_timestamp: '2025-01-01',
        ai_tasks: [],
        task_metadata: {
          generation_timestamp: '',
          statistics: {
            total_tasks: 0,
            ai_generated_tasks: 0,
            static_tasks: 0,
            by_flow_type: {},
            by_source: {},
            by_week: {},
            with_templates: 0,
            pro_required: 0,
            date_range: { earliest: '', latest: '' },
          },
        },
      }
      vi.mocked(mockHttpService.get!).mockReturnValue(
        of(makeAxiosResponse(planJson)),
      )

      const result = await service.downloadJson('session-abc')

      expect(result).toEqual(planJson)
      expect(mockHttpService.get).toHaveBeenCalledWith(
        'http://ai-service/download-json/session-abc',
      )
    })

    it('throws BadGatewayException on failure', async () => {
      vi.mocked(mockHttpService.get!).mockReturnValue(
        throwError(() => new Error('Not found')),
      )

      await expect(service.downloadJson('bad-session')).rejects.toThrow(
        BadGatewayException,
      )
    })
  })

  describe('getProgressStream', () => {
    it('parses SSE data lines into progress objects', async () => {
      const sseData = [
        'data: {"progress":50,"status":"processing","message":"Working...","logs":[],"timestamp":"2025-01-01","has_pdf":false,"has_json":false,"download_links":{},"expires_at":null,"expires_at_formatted":null,"files_ready":{"pdf":false,"json":false,"total":0}}',
        '',
        'data: {"progress":100,"status":"completed","message":"Done","logs":[],"timestamp":"2025-01-01","has_pdf":false,"has_json":true,"download_links":{},"expires_at":null,"expires_at_formatted":null,"files_ready":{"pdf":false,"json":true,"total":1}}',
      ].join('\n')

      vi.mocked(mockHttpService.get!).mockReturnValue(
        of(makeAxiosResponse(sseData)),
      )

      const result = await service.getProgressStream('session-abc')

      expect(result).toHaveLength(2)
      expect(result[0].progress).toBe(50)
      expect(result[0].status).toBe('processing')
      expect(result[1].progress).toBe(100)
      expect(result[1].status).toBe('completed')
    })

    it('skips malformed data lines', async () => {
      const sseData = [
        'data: {"progress":50,"status":"processing","message":"OK","logs":[],"timestamp":"","has_pdf":false,"has_json":false,"download_links":{},"expires_at":null,"expires_at_formatted":null,"files_ready":{"pdf":false,"json":false,"total":0}}',
        'data: not-valid-json',
        'some other line',
      ].join('\n')

      vi.mocked(mockHttpService.get!).mockReturnValue(
        of(makeAxiosResponse(sseData)),
      )

      const result = await service.getProgressStream('session-abc')

      expect(result).toHaveLength(1)
      expect(result[0].progress).toBe(50)
    })

    it('throws BadGatewayException on HTTP error', async () => {
      vi.mocked(mockHttpService.get!).mockReturnValue(
        throwError(() => new Error('Connection reset')),
      )

      await expect(service.getProgressStream('session-abc')).rejects.toThrow(
        BadGatewayException,
      )
    })
  })

  describe('waitForCompletion', () => {
    it('returns when status is completed', async () => {
      const completedProgress = {
        progress: 100,
        status: 'completed',
        message: 'Done',
        logs: [],
        timestamp: '',
        has_pdf: false,
        has_json: true,
        download_links: {},
        expires_at: null,
        expires_at_formatted: null,
        files_ready: { pdf: false, json: true, total: 1 },
      }
      const sseData = `data: ${JSON.stringify(completedProgress)}`

      vi.mocked(mockHttpService.get!).mockReturnValue(
        of(makeAxiosResponse(sseData)),
      )

      const result = await service.waitForCompletion('session-abc')

      expect(result.status).toBe('completed')
      expect(result.progress).toBe(100)
    })

    it('throws when status is failed', async () => {
      const failedProgress = {
        progress: 30,
        status: 'failed',
        message: 'Error occurred',
        logs: [],
        timestamp: '',
        has_pdf: false,
        has_json: false,
        download_links: {},
        expires_at: null,
        expires_at_formatted: null,
        files_ready: { pdf: false, json: false, total: 0 },
      }
      const sseData = `data: ${JSON.stringify(failedProgress)}`

      vi.mocked(mockHttpService.get!).mockReturnValue(
        of(makeAxiosResponse(sseData)),
      )

      await expect(service.waitForCompletion('session-abc')).rejects.toThrow(
        BadGatewayException,
      )
    })

    it('throws on timeout', async () => {
      const processingProgress = {
        progress: 50,
        status: 'processing',
        message: 'Still working...',
        logs: [],
        timestamp: '',
        has_pdf: false,
        has_json: false,
        download_links: {},
        expires_at: null,
        expires_at_formatted: null,
        files_ready: { pdf: false, json: false, total: 0 },
      }
      const sseData = `data: ${JSON.stringify(processingProgress)}`

      vi.mocked(mockHttpService.get!).mockReturnValue(
        of(makeAxiosResponse(sseData)),
      )

      await expect(
        service.waitForCompletion('session-abc', 50, 10),
      ).rejects.toThrow('Campaign plan generation timed out')
    })
  })
})
