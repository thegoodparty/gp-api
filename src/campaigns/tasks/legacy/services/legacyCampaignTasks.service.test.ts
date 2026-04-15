import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LegacyCampaignTasksService } from './legacyCampaignTasks.service'
import { CampaignsService } from '../../../services/campaigns.service'
import { Campaign } from '@prisma/client'
import { STATIC_CAMPAIGN_TASKS } from '../fixtures/legacyCampaignTasks.consts'

const makeCampaign = (overrides = {}): Campaign =>
  ({
    id: 1,
    slug: 'test-campaign',
    userId: 123,
    isActive: true,
    isDemo: false,
    completedTaskIds: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    data: {},
    details: { electionDate: '2025-11-04' },
    aiContent: {},
    vendorTsData: {},
    ...overrides,
  }) as unknown as Campaign

const mockCampaignsService: Partial<CampaignsService> = {
  update: vi.fn(),
}

describe('LegacyCampaignTasksService', () => {
  let service: LegacyCampaignTasksService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new LegacyCampaignTasksService(
      mockCampaignsService as CampaignsService,
    )
  })

  describe('listCampaignTasks', () => {
    it('returns all tasks when no date is provided', () => {
      const campaign = makeCampaign()
      const result = service.listCampaignTasks(campaign)
      expect(result).toEqual(STATIC_CAMPAIGN_TASKS)
    })

    it('returns tasks for the calculated week when date is provided', () => {
      const campaign = makeCampaign()
      const currentDate = new Date('2025-10-07')
      const result = service.listCampaignTasks(campaign, currentDate)

      expect(Array.isArray(result)).toBe(true)
      for (const task of result) {
        expect(task).toHaveProperty('completed')
        expect(task.week).toBe(4)
      }
    })

    it('uses endDate when provided instead of parsing election date', () => {
      const campaign = makeCampaign()
      const currentDate = new Date('2025-10-28')
      const endDate = new Date('2025-11-04')
      const result = service.listCampaignTasks(campaign, currentDate, endDate)

      expect(Array.isArray(result)).toBe(true)
      for (const task of result) {
        expect(task.week).toBe(1)
      }
    })

    it('caps week number at MAX_WEEK_NUMBER (9)', () => {
      const campaign = makeCampaign()
      const currentDate = new Date('2025-01-01')
      const result = service.listCampaignTasks(campaign, currentDate)

      expect(Array.isArray(result)).toBe(true)
      for (const task of result) {
        expect(task.week).toBe(9)
      }
    })

    it('floors week number at 1', () => {
      const campaign = makeCampaign()
      const currentDate = new Date('2025-11-04')
      const result = service.listCampaignTasks(campaign, currentDate)

      expect(Array.isArray(result)).toBe(true)
      for (const task of result) {
        expect(task.week).toBe(1)
      }
    })

    it('marks tasks as completed based on completedTaskIds', () => {
      const firstWeek4Task = STATIC_CAMPAIGN_TASKS.find((t) => t.week === 4)!
      const campaign = makeCampaign({
        completedTaskIds: [firstWeek4Task.id],
      })
      const currentDate = new Date('2025-10-07')
      const result = service.listCampaignTasks(campaign, currentDate)

      const completedTask = result.find(
        (t: { id?: string }) => t.id === firstWeek4Task.id,
      )
      expect(completedTask).toHaveProperty('completed', true)

      const otherTasks = result.filter(
        (t: { id?: string }) => t.id !== firstWeek4Task.id,
      )
      for (const task of otherTasks) {
        expect(task).toHaveProperty('completed', false)
      }
    })
  })

  describe('completeTask', () => {
    it('adds taskId to completedTaskIds and returns task', async () => {
      const campaign = makeCampaign()
      const taskId = STATIC_CAMPAIGN_TASKS[0].id!
      vi.mocked(mockCampaignsService.update!).mockResolvedValue(
        makeCampaign({ completedTaskIds: [taskId] }),
      )

      const result = await service.completeTask(campaign, taskId)

      expect(mockCampaignsService.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { completedTaskIds: [taskId] },
      })
      expect(result.completed).toBe(true)
      expect(result.id).toBe(taskId)
    })

    it('deduplicates taskIds when completing', async () => {
      const taskId = STATIC_CAMPAIGN_TASKS[0].id!
      const campaign = makeCampaign({ completedTaskIds: [taskId] })
      vi.mocked(mockCampaignsService.update!).mockResolvedValue(
        makeCampaign({ completedTaskIds: [taskId] }),
      )

      await service.completeTask(campaign, taskId)

      expect(mockCampaignsService.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { completedTaskIds: [taskId] },
      })
    })
  })

  describe('unCompleteTask', () => {
    it('removes taskId from completedTaskIds and returns task', async () => {
      const taskId = STATIC_CAMPAIGN_TASKS[0].id!
      const campaign = makeCampaign({ completedTaskIds: [taskId] })
      vi.mocked(mockCampaignsService.update!).mockResolvedValue(
        makeCampaign({ completedTaskIds: [] }),
      )

      const result = await service.unCompleteTask(campaign, taskId)

      expect(mockCampaignsService.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { completedTaskIds: [] },
      })
      expect(result.completed).toBe(false)
      expect(result.id).toBe(taskId)
    })
  })
})
