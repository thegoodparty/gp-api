import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CampaignTasksService } from './campaignTasks.service'
import { AiCampaignManagerIntegrationService } from './aiCampaignManagerIntegration.service'
import { Campaign } from '@prisma/client'
import { CampaignTask, CampaignTaskType } from '../campaignTasks.types'
import { createMockLogger } from '@/shared/test-utils/mockLogger.util'

const mockModel = {
  findMany: vi.fn(),
  findFirst: vi.fn(),
  update: vi.fn(),
  deleteMany: vi.fn(),
  createMany: vi.fn(),
}

const mockAiIntegration: Partial<AiCampaignManagerIntegrationService> = {
  generateCampaignTasks: vi.fn(),
}

const makeCampaign = (overrides: Partial<Campaign> = {}): Campaign =>
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
    ...overrides,
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

describe('CampaignTasksService', () => {
  let service: CampaignTasksService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new CampaignTasksService(
      mockAiIntegration as AiCampaignManagerIntegrationService,
    )
    Object.defineProperty(service, '_prisma', {
      get: () => ({ campaignTask: mockModel }),
      configurable: true,
    })
    Object.defineProperty(service, 'logger', {
      get: () => createMockLogger(),
      configurable: true,
    })
  })

  describe('listCampaignTasks', () => {
    it('returns tasks for a campaign ordered by week desc', async () => {
      const tasks = [makeDbTask({ week: 8 }), makeDbTask({ week: 4 })]
      mockModel.findMany.mockResolvedValue(tasks)

      const result = await service.listCampaignTasks(makeCampaign())

      expect(mockModel.findMany).toHaveBeenCalledWith({
        where: { campaignId: 1 },
        orderBy: { week: 'desc' },
      })
      expect(result).toEqual(tasks)
    })
  })

  describe('getCampaignTaskById', () => {
    it('returns a task matching campaignId and id', async () => {
      const task = makeDbTask()
      mockModel.findFirst.mockResolvedValue(task)

      const result = await service.getCampaignTaskById(1, 'task-1')

      expect(mockModel.findFirst).toHaveBeenCalledWith({
        where: { campaignId: 1, id: 'task-1' },
      })
      expect(result).toEqual(task)
    })

    it('returns null when task not found', async () => {
      mockModel.findFirst.mockResolvedValue(null)

      const result = await service.getCampaignTaskById(1, 'nonexistent')

      expect(result).toBeNull()
    })
  })

  describe('completeTask', () => {
    it('marks a task as completed', async () => {
      const task = makeDbTask()
      const updatedTask = { ...task, completed: true }
      mockModel.findFirst.mockResolvedValue(task)
      mockModel.update.mockResolvedValue(updatedTask)

      const result = await service.completeTask(makeCampaign(), 'task-1')

      expect(mockModel.update).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: { completed: true },
      })
      expect(result).toEqual(updatedTask)
    })

    it('returns null when task not found', async () => {
      mockModel.findFirst.mockResolvedValue(null)

      const result = await service.completeTask(makeCampaign(), 'nonexistent')

      expect(result).toBeNull()
      expect(mockModel.update).not.toHaveBeenCalled()
    })
  })

  describe('unCompleteTask', () => {
    it('marks a task as not completed', async () => {
      const task = makeDbTask({ completed: true })
      const updatedTask = { ...task, completed: false }
      mockModel.findFirst.mockResolvedValue(task)
      mockModel.update.mockResolvedValue(updatedTask)

      const result = await service.unCompleteTask(makeCampaign(), 'task-1')

      expect(mockModel.update).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: { completed: false },
      })
      expect(result).toEqual(updatedTask)
    })

    it('returns null when task not found', async () => {
      mockModel.findFirst.mockResolvedValue(null)

      const result = await service.unCompleteTask(makeCampaign(), 'nonexistent')

      expect(result).toBeNull()
      expect(mockModel.update).not.toHaveBeenCalled()
    })
  })

  describe('generateTasks', () => {
    it('generates default tasks then AI tasks and saves them', async () => {
      const aiTasks: CampaignTask[] = [
        {
          id: 'ai-1',
          title: 'AI Task',
          description: 'Generated',
          cta: 'Go',
          flowType: CampaignTaskType.socialMedia,
          week: 3,
        },
      ]
      const savedTasks = [makeDbTask()]

      mockModel.findMany
        .mockResolvedValueOnce([]) // generateDefaultTasks check
        .mockResolvedValueOnce(savedTasks) // saveTasks (default) return
        .mockResolvedValueOnce(savedTasks) // saveTasks (AI) return
      mockModel.deleteMany.mockResolvedValue({ count: 0 })
      mockModel.createMany.mockResolvedValue({ count: 1 })
      vi.mocked(mockAiIntegration.generateCampaignTasks!).mockResolvedValue(
        aiTasks,
      )

      const result = await service.generateTasks(makeCampaign())

      expect(mockAiIntegration.generateCampaignTasks).toHaveBeenCalled()
      expect(result).toEqual(savedTasks)
    })

    it('saves empty tasks when AI generation fails', async () => {
      const savedTasks = [makeDbTask({ isDefaultTask: true })]

      mockModel.findMany
        .mockResolvedValueOnce([makeDbTask({ isDefaultTask: true })]) // defaults exist
        .mockResolvedValueOnce(savedTasks) // saveTasks return
      mockModel.deleteMany.mockResolvedValue({ count: 0 })
      mockModel.createMany.mockResolvedValue({ count: 0 })
      vi.mocked(mockAiIntegration.generateCampaignTasks!).mockRejectedValue(
        new Error('AI service unavailable'),
      )

      const result = await service.generateTasks(makeCampaign())

      expect(mockModel.deleteMany).toHaveBeenCalledWith({
        where: { campaignId: 1, isDefaultTask: false },
      })
      expect(result).toEqual(savedTasks)
    })
  })

  describe('generateDefaultTasks', () => {
    it('creates default tasks when none exist', async () => {
      mockModel.findMany
        .mockResolvedValueOnce([]) // no existing defaults
        .mockResolvedValueOnce([]) // saveTasks return
      mockModel.deleteMany.mockResolvedValue({ count: 0 })
      mockModel.createMany.mockResolvedValue({ count: 1 })

      await service.generateDefaultTasks(makeCampaign())

      expect(mockModel.createMany).toHaveBeenCalled()
      const createCall = mockModel.createMany.mock.calls[0][0]
      expect(createCall.data.length).toBeGreaterThan(0)
      expect(createCall.data[0]).toHaveProperty('campaignId', 1)
    })

    it('skips creation when default tasks already exist', async () => {
      mockModel.findMany.mockResolvedValue([
        makeDbTask({ isDefaultTask: true }),
      ])

      await service.generateDefaultTasks(makeCampaign())

      expect(mockModel.createMany).not.toHaveBeenCalled()
    })
  })

  describe('saveTasks', () => {
    it('deletes non-default tasks and creates new ones', async () => {
      const tasks: CampaignTask[] = [
        {
          id: 'new-1',
          title: 'New Task',
          description: 'Description',
          cta: 'CTA',
          flowType: CampaignTaskType.text,
          week: 2,
          proRequired: true,
          date: '2025-11-01',
        },
      ]
      mockModel.deleteMany.mockResolvedValue({ count: 1 })
      mockModel.createMany.mockResolvedValue({ count: 1 })
      mockModel.findMany.mockResolvedValue([makeDbTask()])

      await service.saveTasks(1, tasks)

      expect(mockModel.deleteMany).toHaveBeenCalledWith({
        where: { campaignId: 1, isDefaultTask: false },
      })
      expect(mockModel.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            campaignId: 1,
            title: 'New Task',
            flowType: CampaignTaskType.text,
            week: 2,
            proRequired: true,
            date: new Date('2025-11-01'),
            completed: false,
            isDefaultTask: false,
          }),
        ],
      })
    })

    it('handles tasks without optional fields', async () => {
      const tasks: CampaignTask[] = [
        {
          id: 'min-1',
          title: 'Minimal Task',
          description: 'Desc',
          cta: 'Go',
          flowType: CampaignTaskType.education,
          week: 1,
        },
      ]
      mockModel.deleteMany.mockResolvedValue({ count: 0 })
      mockModel.createMany.mockResolvedValue({ count: 1 })
      mockModel.findMany.mockResolvedValue([])

      await service.saveTasks(1, tasks)

      expect(mockModel.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            date: null,
            link: undefined,
            proRequired: false,
            deadline: undefined,
            defaultAiTemplateId: undefined,
            isDefaultTask: false,
          }),
        ],
      })
    })
  })

  describe('clearTasks', () => {
    it('deletes all tasks for a campaign', async () => {
      mockModel.deleteMany.mockResolvedValue({ count: 5 })

      await service.clearTasks(1)

      expect(mockModel.deleteMany).toHaveBeenCalledWith({
        where: { campaignId: 1 },
      })
    })
  })
})
