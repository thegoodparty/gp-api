import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AiCampaignManagerIntegrationService } from './aiCampaignManagerIntegration.service'
import { AiCampaignManagerService } from './aiCampaignManager.service'
import { Campaign, PathToVictory } from '@prisma/client'
import {
  CampaignPlanResponse,
  CampaignPlanTask,
} from '../aiCampaignManager.types'
import { CampaignTaskType } from '../campaignTasks.types'
import { createMockLogger } from '@/shared/test-utils/mockLogger.util'

const mockModel = {
  findUnique: vi.fn(),
  findFirst: vi.fn(),
  create: vi.fn(),
  delete: vi.fn(),
}

const mockAiManager: Partial<AiCampaignManagerService> = {
  startCampaignPlanGeneration: vi.fn(),
  waitForCompletion: vi.fn(),
  downloadJson: vi.fn(),
}

const makeCampaign = (
  overrides: Partial<Campaign & { pathToVictory?: PathToVictory | null }> = {},
) =>
  ({
    id: 1,
    slug: 'test-campaign',
    userId: 123,
    isActive: true,
    isDemo: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    data: { name: 'Jane Doe' },
    details: {
      office: 'City Council',
      state: 'California',
      electionDate: '2025-11-04',
      partisanType: 'nonpartisan',
    },
    aiContent: {},
    vendorTsData: {},
    pathToVictory: {
      id: 1,
      campaignId: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      data: {
        winNumber: 500,
        totalRegisteredVoters: 3000,
        projectedTurnout: 1800,
      },
    },
    ...overrides,
  }) as Campaign & { pathToVictory: PathToVictory | null }

const makeAiTask = (
  overrides: Partial<CampaignPlanTask> = {},
): CampaignPlanTask => ({
  title: 'AI Generated Door Knock',
  description: 'Knock on doors to meet voters',
  cta: 'Start knocking',
  flowType: 'doorKnocking',
  week: 6,
  proRequired: true,
  date: '2025-09-15',
  ...overrides,
})

const makePlanResponse = (
  overrides: Partial<CampaignPlanResponse> = {},
): CampaignPlanResponse => ({
  campaign_plan: 'A comprehensive campaign plan...',
  candidate_name: 'Jane Doe',
  election_date: '2025-11-04',
  office_and_jurisdiction: 'City Council in California',
  generation_timestamp: new Date().toISOString(),
  ai_tasks: [makeAiTask()],
  task_metadata: {
    generation_timestamp: new Date().toISOString(),
    statistics: {
      total_tasks: 1,
      ai_generated_tasks: 1,
      static_tasks: 0,
      by_flow_type: { doorKnocking: 1 },
      by_source: { ai: 1 },
      by_week: { '6': 1 },
      with_templates: 0,
      pro_required: 1,
      date_range: { earliest: '2025-09-15', latest: '2025-09-15' },
    },
  },
  ...overrides,
})

describe('AiCampaignManagerIntegrationService', () => {
  let service: AiCampaignManagerIntegrationService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new AiCampaignManagerIntegrationService(
      mockAiManager as AiCampaignManagerService,
    )
    Object.defineProperty(service, '_prisma', {
      get: () => ({ campaignPlan: mockModel }),
      configurable: true,
    })
    Object.defineProperty(service, 'logger', {
      get: () => createMockLogger(),
      configurable: true,
    })
  })

  describe('generateCampaignTasks', () => {
    it('returns cached tasks when plan hash matches', async () => {
      const campaign = makeCampaign()
      const planResponse = makePlanResponse()

      mockModel.findUnique.mockResolvedValue({
        id: 1,
        campaignId: 1,
        campaignInfoHash: expect.any(String),
        plan: planResponse.campaign_plan,
        rawJson: planResponse,
      })

      // Need to get the actual hash to make the cache hit work
      // Access private method via prototype
      const buildRequest = (
        service as unknown as {
          buildCampaignPlanRequest: (typeof service)['buildCampaignPlanRequest']
        }
      ).buildCampaignPlanRequest.call(service, campaign)
      const hash = (
        service as unknown as {
          generateCampaignInfoHashFromRequest: (
            r: typeof buildRequest,
          ) => string
        }
      ).generateCampaignInfoHashFromRequest.call(service, buildRequest)

      mockModel.findUnique.mockResolvedValue({
        id: 1,
        campaignId: 1,
        campaignInfoHash: hash,
        plan: planResponse.campaign_plan,
        rawJson: planResponse,
      })

      const result = await service.generateCampaignTasks(campaign)

      expect(mockAiManager.startCampaignPlanGeneration).not.toHaveBeenCalled()
      expect(result).toHaveLength(1)
      expect(result[0].flowType).toBe(CampaignTaskType.doorKnocking)
    })

    it('generates new tasks when no cached plan exists', async () => {
      const campaign = makeCampaign()
      const planResponse = makePlanResponse()

      mockModel.findUnique.mockResolvedValue(null)
      vi.mocked(mockAiManager.startCampaignPlanGeneration!).mockResolvedValue({
        session_id: 'session-123',
      })
      vi.mocked(mockAiManager.waitForCompletion!).mockResolvedValue({
        progress: 100,
        status: 'completed',
        message: 'Done',
        logs: [],
        timestamp: new Date().toISOString(),
        has_pdf: false,
        has_json: true,
        download_links: { json: '/download/json' },
        expires_at: null,
        expires_at_formatted: null,
        files_ready: { pdf: false, json: true, total: 1 },
      })
      vi.mocked(mockAiManager.downloadJson!).mockResolvedValue(planResponse)
      mockModel.create.mockResolvedValue({})

      const result = await service.generateCampaignTasks(campaign)

      expect(mockAiManager.startCampaignPlanGeneration).toHaveBeenCalled()
      expect(mockAiManager.waitForCompletion).toHaveBeenCalledWith(
        'session-123',
      )
      expect(mockAiManager.downloadJson).toHaveBeenCalledWith('session-123')
      expect(result).toHaveLength(1)
      expect(result[0].title).toBe('AI Generated Door Knock')
    })

    it('throws when AI service fails', async () => {
      const campaign = makeCampaign()
      mockModel.findUnique.mockResolvedValue(null)
      vi.mocked(mockAiManager.startCampaignPlanGeneration!).mockRejectedValue(
        new Error('Service unavailable'),
      )

      await expect(service.generateCampaignTasks(campaign)).rejects.toThrow(
        'Service unavailable',
      )
    })
  })

  describe('buildCampaignPlanRequest (via generateCampaignTasks)', () => {
    it('builds request with correct campaign data', async () => {
      const campaign = makeCampaign()
      mockModel.findUnique.mockResolvedValue(null)
      vi.mocked(mockAiManager.startCampaignPlanGeneration!).mockResolvedValue({
        session_id: 'session-1',
      })
      vi.mocked(mockAiManager.waitForCompletion!).mockResolvedValue({
        progress: 100,
        status: 'completed',
        message: 'Done',
        logs: [],
        timestamp: new Date().toISOString(),
        has_pdf: false,
        has_json: true,
        download_links: {},
        expires_at: null,
        expires_at_formatted: null,
        files_ready: { pdf: false, json: true, total: 1 },
      })
      vi.mocked(mockAiManager.downloadJson!).mockResolvedValue(
        makePlanResponse(),
      )
      mockModel.create.mockResolvedValue({})

      await service.generateCampaignTasks(campaign)

      const request = vi.mocked(mockAiManager.startCampaignPlanGeneration!).mock
        .calls[0][0]

      expect(request.candidate_name).toBe('Jane Doe')
      expect(request.election_date).toBe('2025-11-04')
      expect(request.office_and_jurisdiction).toBe('City Council in California')
      expect(request.race_type).toBe('Nonpartisan')
      expect(request.win_number).toBe(500)
      expect(request.total_likely_voters).toBe(1800)
    })

    it('uses defaults when campaign data is sparse', async () => {
      const campaign = makeCampaign({
        data: {} as PrismaJson.CampaignData,
        details: {} as PrismaJson.CampaignDetails,
        pathToVictory: null,
      })
      mockModel.findUnique.mockResolvedValue(null)
      vi.mocked(mockAiManager.startCampaignPlanGeneration!).mockResolvedValue({
        session_id: 'session-1',
      })
      vi.mocked(mockAiManager.waitForCompletion!).mockResolvedValue({
        progress: 100,
        status: 'completed',
        message: 'Done',
        logs: [],
        timestamp: new Date().toISOString(),
        has_pdf: false,
        has_json: true,
        download_links: {},
        expires_at: null,
        expires_at_formatted: null,
        files_ready: { pdf: false, json: true, total: 1 },
      })
      vi.mocked(mockAiManager.downloadJson!).mockResolvedValue(
        makePlanResponse(),
      )
      mockModel.create.mockResolvedValue({})

      await service.generateCampaignTasks(campaign)

      const request = vi.mocked(mockAiManager.startCampaignPlanGeneration!).mock
        .calls[0][0]

      expect(request.candidate_name).toBe('Campaign 1')
      expect(request.office_and_jurisdiction).toBe(
        'Local Office in Unknown State',
      )
      expect(request.win_number).toBe(1000)
      expect(request.total_likely_voters).toBe(3000)
    })
  })

  describe('parseCampaignPlanToTasks', () => {
    it('converts AI tasks to CampaignTask format', async () => {
      const campaign = makeCampaign()
      const planResponse = makePlanResponse({
        ai_tasks: [
          makeAiTask({ flowType: 'socialMedia', week: 3 }),
          makeAiTask({ flowType: 'text', week: 1, proRequired: true }),
        ],
      })
      mockModel.findUnique.mockResolvedValue(null)
      vi.mocked(mockAiManager.startCampaignPlanGeneration!).mockResolvedValue({
        session_id: 's',
      })
      vi.mocked(mockAiManager.waitForCompletion!).mockResolvedValue({
        progress: 100,
        status: 'completed',
        message: '',
        logs: [],
        timestamp: '',
        has_pdf: false,
        has_json: true,
        download_links: {},
        expires_at: null,
        expires_at_formatted: null,
        files_ready: { pdf: false, json: true, total: 1 },
      })
      vi.mocked(mockAiManager.downloadJson!).mockResolvedValue(planResponse)
      mockModel.create.mockResolvedValue({})

      const tasks = await service.generateCampaignTasks(campaign)

      expect(tasks).toHaveLength(2)
      expect(tasks[0].flowType).toBe(CampaignTaskType.socialMedia)
      expect(tasks[0].week).toBe(3)
      expect(tasks[1].flowType).toBe(CampaignTaskType.text)
      expect(tasks[1].proRequired).toBe(true)
    })

    it('creates fallback tasks when AI returns empty array', async () => {
      const campaign = makeCampaign()
      const planResponse = makePlanResponse({ ai_tasks: [] })
      mockModel.findUnique.mockResolvedValue(null)
      vi.mocked(mockAiManager.startCampaignPlanGeneration!).mockResolvedValue({
        session_id: 's',
      })
      vi.mocked(mockAiManager.waitForCompletion!).mockResolvedValue({
        progress: 100,
        status: 'completed',
        message: '',
        logs: [],
        timestamp: '',
        has_pdf: false,
        has_json: true,
        download_links: {},
        expires_at: null,
        expires_at_formatted: null,
        files_ready: { pdf: false, json: true, total: 1 },
      })
      vi.mocked(mockAiManager.downloadJson!).mockResolvedValue(planResponse)
      mockModel.create.mockResolvedValue({})

      const tasks = await service.generateCampaignTasks(campaign)

      expect(tasks).toHaveLength(2)
      expect(tasks[0].title).toBe('Set up your campaign foundation')
      expect(tasks[1].title).toBe('Create social media presence')
    })

    it('maps unknown flowType to education', async () => {
      const campaign = makeCampaign()
      const planResponse = makePlanResponse({
        ai_tasks: [makeAiTask({ flowType: 'unknown_type' })],
      })
      mockModel.findUnique.mockResolvedValue(null)
      vi.mocked(mockAiManager.startCampaignPlanGeneration!).mockResolvedValue({
        session_id: 's',
      })
      vi.mocked(mockAiManager.waitForCompletion!).mockResolvedValue({
        progress: 100,
        status: 'completed',
        message: '',
        logs: [],
        timestamp: '',
        has_pdf: false,
        has_json: true,
        download_links: {},
        expires_at: null,
        expires_at_formatted: null,
        files_ready: { pdf: false, json: true, total: 1 },
      })
      vi.mocked(mockAiManager.downloadJson!).mockResolvedValue(planResponse)
      mockModel.create.mockResolvedValue({})

      const tasks = await service.generateCampaignTasks(campaign)

      expect(tasks[0].flowType).toBe(CampaignTaskType.education)
    })
  })

  describe('saveCampaignPlan', () => {
    it('saves plan and stores hash for caching', async () => {
      const campaign = makeCampaign()
      const planResponse = makePlanResponse()

      mockModel.findUnique
        .mockResolvedValueOnce(null) // checkForExistingPlanVersion
        .mockResolvedValueOnce(null) // saveCampaignPlan check
      vi.mocked(mockAiManager.startCampaignPlanGeneration!).mockResolvedValue({
        session_id: 'session-1',
      })
      vi.mocked(mockAiManager.waitForCompletion!).mockResolvedValue({
        progress: 100,
        status: 'completed',
        message: '',
        logs: [],
        timestamp: '',
        has_pdf: false,
        has_json: true,
        download_links: {},
        expires_at: null,
        expires_at_formatted: null,
        files_ready: { pdf: false, json: true, total: 1 },
      })
      vi.mocked(mockAiManager.downloadJson!).mockResolvedValue(planResponse)
      mockModel.create.mockResolvedValue({})

      await service.generateCampaignTasks(campaign)

      expect(mockModel.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          campaignId: 1,
          plan: planResponse.campaign_plan,
          rawJson: planResponse,
          campaignInfoHash: expect.any(String),
        }),
      })
    })

    it('deletes existing plan before creating new one', async () => {
      const campaign = makeCampaign()
      const planResponse = makePlanResponse()
      const existingPlan = {
        id: 99,
        campaignId: 1,
        campaignInfoHash: 'old-hash',
        plan: 'old plan',
        rawJson: null,
      }

      mockModel.findUnique
        .mockResolvedValueOnce(existingPlan) // checkForExistingPlanVersion (hash mismatch)
        .mockResolvedValueOnce(existingPlan) // saveCampaignPlan check
      mockModel.delete.mockResolvedValue(existingPlan)
      vi.mocked(mockAiManager.startCampaignPlanGeneration!).mockResolvedValue({
        session_id: 'session-1',
      })
      vi.mocked(mockAiManager.waitForCompletion!).mockResolvedValue({
        progress: 100,
        status: 'completed',
        message: '',
        logs: [],
        timestamp: '',
        has_pdf: false,
        has_json: true,
        download_links: {},
        expires_at: null,
        expires_at_formatted: null,
        files_ready: { pdf: false, json: true, total: 1 },
      })
      vi.mocked(mockAiManager.downloadJson!).mockResolvedValue(planResponse)
      mockModel.create.mockResolvedValue({})

      await service.generateCampaignTasks(campaign)

      expect(mockModel.delete).toHaveBeenCalledWith({
        where: { campaignId: 1 },
      })
      expect(mockModel.create).toHaveBeenCalled()
    })
  })

  describe('calculateWeekFromDate', () => {
    it('calculates weeks between task date and election date', async () => {
      const campaign = makeCampaign({
        details: {
          electionDate: '2025-11-04',
        } as PrismaJson.CampaignDetails,
      })
      const planResponse = makePlanResponse({
        ai_tasks: [makeAiTask({ date: '2025-10-07', week: undefined })],
      })

      mockModel.findUnique.mockResolvedValue(null)
      vi.mocked(mockAiManager.startCampaignPlanGeneration!).mockResolvedValue({
        session_id: 's',
      })
      vi.mocked(mockAiManager.waitForCompletion!).mockResolvedValue({
        progress: 100,
        status: 'completed',
        message: '',
        logs: [],
        timestamp: '',
        has_pdf: false,
        has_json: true,
        download_links: {},
        expires_at: null,
        expires_at_formatted: null,
        files_ready: { pdf: false, json: true, total: 1 },
      })
      vi.mocked(mockAiManager.downloadJson!).mockResolvedValue(planResponse)
      mockModel.create.mockResolvedValue({})

      const tasks = await service.generateCampaignTasks(campaign)

      expect(tasks[0].week).toBe(4)
    })
  })

  describe('hash generation', () => {
    it('produces consistent hashes for the same input', () => {
      const generateHash = (
        service as unknown as {
          generateCampaignInfoHash: (
            info: Record<string, string | number | boolean | null | undefined>,
          ) => string
        }
      ).generateCampaignInfoHash.bind(service)

      const input = {
        candidate_name: 'Jane',
        election_date: '2025-11-04',
        win_number: 500,
      }

      const hash1 = generateHash(input)
      const hash2 = generateHash(input)

      expect(hash1).toBe(hash2)
      expect(hash1).toHaveLength(64) // SHA256 hex
    })

    it('produces same hash regardless of key order', () => {
      const generateHash = (
        service as unknown as {
          generateCampaignInfoHash: (
            info: Record<string, string | number | boolean | null | undefined>,
          ) => string
        }
      ).generateCampaignInfoHash.bind(service)

      const hash1 = generateHash({ a: '1', b: '2', c: '3' })
      const hash2 = generateHash({ c: '3', a: '1', b: '2' })

      expect(hash1).toBe(hash2)
    })
  })
})
