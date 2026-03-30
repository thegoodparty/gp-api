import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LegacyCampaignTasksController } from './legacyCampaignTasks.controller'
import { LegacyCampaignTasksService } from './services/legacyCampaignTasks.service'
import { Campaign } from '@prisma/client'
import { CampaignTaskType } from '../campaignTasks.types'

const makeCampaign = (): Campaign =>
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
  }) as unknown as Campaign

const makeTask = (overrides = {}) => ({
  id: 'task-1',
  title: 'Test Task',
  description: 'A test task',
  cta: 'Do it',
  flowType: CampaignTaskType.education,
  week: 4,
  ...overrides,
})

const mockTasksService: Partial<LegacyCampaignTasksService> = {
  listCampaignTasks: vi.fn(),
  completeTask: vi.fn(),
  unCompleteTask: vi.fn(),
}

describe('LegacyCampaignTasksController', () => {
  let controller: LegacyCampaignTasksController

  beforeEach(() => {
    vi.clearAllMocks()
    controller = new LegacyCampaignTasksController(
      mockTasksService as LegacyCampaignTasksService,
    )
  })

  describe('listCampaignTasks', () => {
    it('delegates to service without date params', () => {
      const campaign = makeCampaign()
      const tasks = [makeTask()]
      vi.mocked(mockTasksService.listCampaignTasks!).mockReturnValue(tasks)

      const result = controller.listCampaignTasks(campaign)

      expect(mockTasksService.listCampaignTasks).toHaveBeenCalledWith(
        campaign,
        undefined,
        undefined,
      )
      expect(result).toEqual(tasks)
    })

    it('delegates to service with date params', () => {
      const campaign = makeCampaign()
      const date = new Date('2025-10-01')
      const endDate = new Date('2025-11-04')
      const tasks = [makeTask()]
      vi.mocked(mockTasksService.listCampaignTasks!).mockReturnValue(tasks)

      const result = controller.listCampaignTasks(campaign, date, endDate)

      expect(mockTasksService.listCampaignTasks).toHaveBeenCalledWith(
        campaign,
        date,
        endDate,
      )
      expect(result).toEqual(tasks)
    })
  })

  describe('completeTask', () => {
    it('delegates to service with campaign and task id', async () => {
      const campaign = makeCampaign()
      const task = makeTask({ completed: true })
      vi.mocked(mockTasksService.completeTask!).mockResolvedValue(task)

      const result = await controller.completeTask(campaign, 'task-1')

      expect(mockTasksService.completeTask).toHaveBeenCalledWith(
        campaign,
        'task-1',
      )
      expect(result).toEqual(task)
    })
  })

  describe('unCompleteTask', () => {
    it('delegates to service with campaign and task id', async () => {
      const campaign = makeCampaign()
      const task = makeTask({ completed: false })
      vi.mocked(mockTasksService.unCompleteTask!).mockResolvedValue(task)

      const result = await controller.unCompleteTask(campaign, 'task-1')

      expect(mockTasksService.unCompleteTask).toHaveBeenCalledWith(
        campaign,
        'task-1',
      )
      expect(result).toEqual(task)
    })
  })
})
