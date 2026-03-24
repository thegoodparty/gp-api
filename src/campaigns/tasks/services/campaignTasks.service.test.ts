import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BadGatewayException, NotFoundException } from '@nestjs/common'
import { Campaign } from '@prisma/client'
import { CampaignTaskType } from '../campaignTasks.types'
import { firstValueFrom, toArray } from 'rxjs'
import { CampaignTasksService } from './campaignTasks.service'
import { AiCampaignManagerIntegrationService } from './aiCampaignManagerIntegration.service'
import { QueueProducerService } from 'src/queue/producer/queueProducer.service'
import { MessageGroup, QueueType } from 'src/queue/queue.types'
import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import { defaultTasks } from '../fixtures/defaultTasks'
import { CampaignTask } from '../campaignTasks.types'

vi.mock('src/shared/util/sleep.util', () => ({
  sleep: vi.fn().mockResolvedValue(undefined),
}))

const mockTxModel = {
  deleteMany: vi.fn(),
  createMany: vi.fn(),
}

const mockModel = {
  findMany: vi.fn(),
  findFirst: vi.fn(),
  update: vi.fn(),
  deleteMany: vi.fn(),
  createMany: vi.fn(),
}

const mockTransaction = vi.fn(
  async (callback: (tx: unknown) => Promise<unknown>) => {
    return callback({ campaignTask: mockTxModel })
  },
)

const mockAiIntegration: Partial<AiCampaignManagerIntegrationService> = {
  generateCampaignTasks: vi.fn(),
  startOrGetCached: vi.fn(),
  getLatestProgress: vi.fn(),
  finishGeneration: vi.fn(),
}

const mockQueueProducer: Partial<QueueProducerService> = {
  sendMessage: vi.fn(),
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
    service = new CampaignTasksService(
      mockAiIntegration as AiCampaignManagerIntegrationService,
      mockQueueProducer as QueueProducerService,
    )
    Object.defineProperty(service, '_prisma', {
      get: () => ({
        campaignTask: mockModel,
        $transaction: mockTransaction,
      }),
      configurable: true,
    })
    Object.defineProperty(service, 'logger', {
      get: () => createMockLogger(),
      configurable: true,
    })
  })

  describe('listCampaignTasks', () => {
    it('returns tasks ordered by week desc', async () => {
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
    it('returns task matching campaignId and id', async () => {
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
    it('marks task as completed', async () => {
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

    it('throws NotFoundException when task not found', async () => {
      mockModel.findFirst.mockResolvedValue(null)

      await expect(
        service.completeTask(makeCampaign(), 'missing'),
      ).rejects.toThrow(NotFoundException)
    })
  })

  describe('unCompleteTask', () => {
    it('marks task as uncompleted', async () => {
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

    it('throws NotFoundException when task not found', async () => {
      mockModel.findFirst.mockResolvedValue(null)

      await expect(
        service.unCompleteTask(makeCampaign(), 'missing'),
      ).rejects.toThrow(NotFoundException)
    })
  })

  describe('enqueueGenerateTasks', () => {
    it('queues GENERATE_TASKS and returns accepted', async () => {
      vi.mocked(mockQueueProducer.sendMessage!).mockResolvedValue(undefined)

      const result = await service.enqueueGenerateTasks(makeCampaign())

      expect(mockQueueProducer.sendMessage).toHaveBeenCalledWith(
        {
          type: QueueType.GENERATE_TASKS,
          data: { campaignId: 1 },
        },
        MessageGroup.default,
        { throwOnError: true },
      )
      expect(result).toEqual({ accepted: true })
    })

    it('throws BadGatewayException when queue send fails', async () => {
      vi.mocked(mockQueueProducer.sendMessage!).mockRejectedValue(
        new Error('SQS down'),
      )

      await expect(
        service.enqueueGenerateTasks(makeCampaign()),
      ).rejects.toThrow(BadGatewayException)
    })
  })

  describe('generateTasks', () => {
    it('calls generateDefaultTasks, then AI integration, then saveTasks', async () => {
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
        .mockResolvedValueOnce([makeDbTask({ isDefaultTask: true })])
        .mockResolvedValueOnce(savedTasks)
      mockTxModel.deleteMany.mockResolvedValue({ count: 0 })
      mockTxModel.createMany.mockResolvedValue({ count: 1 })
      vi.mocked(mockAiIntegration.generateCampaignTasks!).mockResolvedValue(
        aiTasks,
      )

      const result = await service.generateTasks(makeCampaign())

      expect(mockAiIntegration.generateCampaignTasks).toHaveBeenCalledWith(
        makeCampaign(),
      )
      expect(mockTransaction).toHaveBeenCalled()
      expect(result).toEqual(savedTasks)
    })

    it('falls back to empty tasks on AI failure', async () => {
      const savedTasks = [makeDbTask({ isDefaultTask: true })]

      mockModel.findMany
        .mockResolvedValueOnce([makeDbTask({ isDefaultTask: true })])
        .mockResolvedValueOnce(savedTasks)
      mockTxModel.deleteMany.mockResolvedValue({ count: 0 })
      mockTxModel.createMany.mockResolvedValue({ count: 0 })
      vi.mocked(mockAiIntegration.generateCampaignTasks!).mockRejectedValue(
        new Error('AI service unavailable'),
      )

      const result = await service.generateTasks(makeCampaign())

      expect(mockTxModel.deleteMany).toHaveBeenCalledWith({
        where: { campaignId: 1, isDefaultTask: false },
      })
      expect(mockTxModel.createMany).toHaveBeenCalledWith({ data: [] })
      expect(result).toEqual(savedTasks)
    })
  })

  describe('generateTasksStream', () => {
    it('returns Observable that streams progress and completion for cached result', async () => {
      const cachedTasks: CampaignTask[] = [
        {
          id: 'cached-1',
          title: 'Cached',
          description: 'Cached task',
          cta: 'Go',
          flowType: CampaignTaskType.education,
          week: 3,
        },
      ]
      const savedTasks = [makeDbTask({ id: 'saved-1' })]

      mockModel.findMany
        .mockResolvedValueOnce([makeDbTask({ isDefaultTask: true })])
        .mockResolvedValueOnce(savedTasks)
      mockTxModel.deleteMany.mockResolvedValue({ count: 0 })
      mockTxModel.createMany.mockResolvedValue({ count: 1 })
      vi.mocked(mockAiIntegration.startOrGetCached!).mockResolvedValue({
        cached: true,
        tasks: cachedTasks,
      })

      const observable = service.generateTasksStream(makeCampaign())
      const events = await firstValueFrom(observable.pipe(toArray()))

      expect(events.length).toBeGreaterThanOrEqual(2)
      expect(events[0].data).toEqual({
        type: 'progress',
        progress: 0,
        message: 'Starting AI task generation...',
      })
      const completeEvent = events.find(
        (e) => (e.data as { type: string }).type === 'complete',
      )
      expect(completeEvent).toBeDefined()
      expect((completeEvent!.data as { tasks: unknown[] }).tasks).toEqual(
        savedTasks,
      )
    })

    it('checks subscriber.closed during polling', async () => {
      const savedTasks = [makeDbTask()]
      const generatedTasks: CampaignTask[] = [
        {
          id: 'gen-1',
          title: 'Generated',
          description: 'A task',
          cta: 'Go',
          flowType: CampaignTaskType.education,
          week: 2,
        },
      ]

      mockModel.findMany
        .mockResolvedValueOnce([makeDbTask({ isDefaultTask: true })])
        .mockResolvedValueOnce(savedTasks)
      mockTxModel.deleteMany.mockResolvedValue({ count: 0 })
      mockTxModel.createMany.mockResolvedValue({ count: 1 })
      vi.mocked(mockAiIntegration.startOrGetCached!).mockResolvedValue({
        cached: false,
        sessionId: 'session-123',
      })
      vi.mocked(mockAiIntegration.getLatestProgress!)
        .mockResolvedValueOnce({
          progress: 50,
          status: 'processing',
          message: 'Working...',
        } as Awaited<
          ReturnType<AiCampaignManagerIntegrationService['getLatestProgress']>
        >)
        .mockResolvedValueOnce({
          progress: 100,
          status: 'completed',
          message: 'Done',
        } as Awaited<
          ReturnType<AiCampaignManagerIntegrationService['getLatestProgress']>
        >)
      vi.mocked(mockAiIntegration.finishGeneration!).mockResolvedValue(
        generatedTasks,
      )

      const observable = service.generateTasksStream(makeCampaign())
      const events = await firstValueFrom(observable.pipe(toArray()))

      const progressEvents = events.filter(
        (e) => (e.data as { type: string }).type === 'progress',
      )
      expect(progressEvents.length).toBeGreaterThanOrEqual(2)

      expect(
        progressEvents.some(
          (e) => (e.data as { progress: number }).progress === 50,
        ),
      ).toBe(true)

      const completeEvent = events.find(
        (e) => (e.data as { type: string }).type === 'complete',
      )
      expect(completeEvent).toBeDefined()
      expect((completeEvent!.data as { tasks: unknown[] }).tasks).toEqual(
        savedTasks,
      )
    })

    it('handles error during stream and falls back to empty tasks', async () => {
      const savedTasks = [makeDbTask({ isDefaultTask: true })]

      mockModel.findMany
        .mockResolvedValueOnce([makeDbTask({ isDefaultTask: true })])
        .mockResolvedValueOnce(savedTasks)
      mockTxModel.deleteMany.mockResolvedValue({ count: 0 })
      mockTxModel.createMany.mockResolvedValue({ count: 0 })
      vi.mocked(mockAiIntegration.startOrGetCached!).mockRejectedValue(
        new Error('AI service down'),
      )

      const observable = service.generateTasksStream(makeCampaign())
      const events = await firstValueFrom(observable.pipe(toArray()))

      const completeEvent = events.find(
        (e) => (e.data as { type: string }).type === 'complete',
      )
      expect(completeEvent).toBeDefined()
      expect((completeEvent!.data as { tasks: unknown[] }).tasks).toEqual(
        savedTasks,
      )
    })
  })

  describe('generateDefaultTasks', () => {
    it('skips if defaults already exist', async () => {
      mockModel.findMany.mockResolvedValue([
        makeDbTask({ isDefaultTask: true }),
      ])

      await service.generateDefaultTasks(makeCampaign())

      expect(mockTransaction).not.toHaveBeenCalled()
    })

    it('creates default tasks if none exist', async () => {
      mockModel.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([])
      mockTxModel.deleteMany.mockResolvedValue({ count: 0 })
      mockTxModel.createMany.mockResolvedValue({ count: 1 })

      await service.generateDefaultTasks(makeCampaign())

      expect(mockTransaction).toHaveBeenCalled()
      expect(mockTxModel.createMany).toHaveBeenCalled()
      const createCall = mockTxModel.createMany.mock.calls[0][0]
      expect(createCall.data).toHaveLength(defaultTasks.length)
      expect(createCall.data[0]).toMatchObject({
        campaignId: 1,
        title: defaultTasks[0].title,
        isDefaultTask: true,
      })
    })
  })

  describe('saveTasks', () => {
    it('uses transaction to delete non-default and create new tasks', async () => {
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
      mockTxModel.deleteMany.mockResolvedValue({ count: 1 })
      mockTxModel.createMany.mockResolvedValue({ count: 1 })
      mockModel.findMany.mockResolvedValue([makeDbTask()])

      const result = await service.saveTasks(1, tasks)

      expect(mockTransaction).toHaveBeenCalled()
      expect(mockTxModel.deleteMany).toHaveBeenCalledWith({
        where: { campaignId: 1, isDefaultTask: false },
      })
      expect(mockTxModel.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            campaignId: 1,
            title: 'New Task',
            description: 'Description',
            cta: 'CTA',
            flowType: CampaignTaskType.text,
            week: 2,
            proRequired: true,
            date: new Date('2025-11-01'),
            completed: false,
            isDefaultTask: false,
          }),
        ],
      })
      expect(mockModel.findMany).toHaveBeenCalledWith({
        where: { campaignId: 1 },
        orderBy: { week: 'desc' },
      })
      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'task-1', campaignId: 1 }),
        ]),
      )
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
      mockTxModel.deleteMany.mockResolvedValue({ count: 0 })
      mockTxModel.createMany.mockResolvedValue({ count: 1 })
      mockModel.findMany.mockResolvedValue([])

      await service.saveTasks(1, tasks)

      expect(mockTxModel.createMany).toHaveBeenCalledWith({
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
