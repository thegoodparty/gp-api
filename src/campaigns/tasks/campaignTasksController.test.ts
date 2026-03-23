import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CampaignTasksController } from './campaignTasksController'
import { CampaignTasksService } from './services/campaignTasks.service'
import { Campaign, CampaignTaskType } from '@prisma/client'

const makeCampaign = (): Campaign =>
  ({
    id: 1,
    slug: 'test-campaign',
    userId: 123,
    isActive: true,
    isDemo: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    data: {},
    details: {},
    aiContent: {},
    vendorTsData: {},
  }) as Campaign

const makeDbTask = (overrides = {}) => ({
  id: 'task-1',
  campaignId: 1,
  title: 'Test Task',
  description: 'A test task',
  cta: 'Do it',
  flowType: CampaignTaskType.education,
  week: 4,
  date: null,
  link: null,
  proRequired: false,
  isDefaultTask: false,
  deadline: null,
  defaultAiTemplateId: null,
  completed: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

const mockTasksService: Partial<CampaignTasksService> = {
  listCampaignTasks: vi.fn(),
  completeTask: vi.fn(),
  unCompleteTask: vi.fn(),
  generateTasks: vi.fn(),
}

describe('CampaignTasksController', () => {
  let controller: CampaignTasksController

  beforeEach(() => {
    vi.clearAllMocks()
    controller = new CampaignTasksController(
      mockTasksService as CampaignTasksService,
    )
  })

  describe('listCampaignTasks', () => {
    it('delegates to service with campaign', () => {
      const campaign = makeCampaign()
      const tasks = [makeDbTask()]
      vi.mocked(mockTasksService.listCampaignTasks!).mockResolvedValue(tasks)

      const result = controller.listCampaignTasks(campaign)

      expect(mockTasksService.listCampaignTasks).toHaveBeenCalledWith(campaign)
      expect(result).resolves.toEqual(tasks)
    })
  })

  describe('completeTask', () => {
    it('delegates to service with campaign and task id', async () => {
      const campaign = makeCampaign()
      const updatedTask = makeDbTask({ completed: true })
      vi.mocked(mockTasksService.completeTask!).mockResolvedValue(updatedTask)

      const result = await controller.completeTask(campaign, 'task-1')

      expect(mockTasksService.completeTask).toHaveBeenCalledWith(
        campaign,
        'task-1',
      )
      expect(result).toEqual(updatedTask)
    })
  })

  describe('unCompleteTask', () => {
    it('delegates to service with campaign and task id', async () => {
      const campaign = makeCampaign()
      const task = makeDbTask({ completed: false })
      vi.mocked(mockTasksService.unCompleteTask!).mockResolvedValue(task)

      const result = await controller.unCompleteTask(campaign, 'task-1')

      expect(mockTasksService.unCompleteTask).toHaveBeenCalledWith(
        campaign,
        'task-1',
      )
      expect(result).toEqual(task)
    })
  })

  describe('generateTasks', () => {
    it('delegates to service with campaign', async () => {
      const campaign = makeCampaign()
      const tasks = [makeDbTask()]
      vi.mocked(mockTasksService.generateTasks!).mockResolvedValue(tasks)

      const result = await controller.generateTasks(campaign)

      expect(mockTasksService.generateTasks).toHaveBeenCalledWith(campaign)
      expect(result).toEqual(tasks)
    })
  })
})
