import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BadGatewayException, NotFoundException } from '@nestjs/common'
import { CampaignWithPathToVictory } from '../../campaigns.types'
import { CampaignTaskType } from '../campaignTasks.types'
import { firstValueFrom, toArray } from 'rxjs'
import { CampaignTasksService } from './campaignTasks.service'
import { AiCampaignManagerIntegrationService } from './aiCampaignManagerIntegration.service'
import { QueueProducerService } from 'src/queue/producer/queueProducer.service'
import { CampaignUpdateHistoryType } from '@prisma/client'
import { MessageGroup, QueueType } from 'src/queue/queue.types'
import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import { CampaignTask } from '../campaignTasks.types'
import { generalDefaultTasks } from '../fixtures/defaultTasks'
import { primaryDefaultTasks } from '../fixtures/defaultTasksForPrimary'

vi.mock('src/shared/util/sleep.util', () => ({
  sleep: vi.fn().mockResolvedValue(undefined),
}))

const mockTxModel = {
  deleteMany: vi.fn(),
  createMany: vi.fn(),
  count: vi.fn(),
  findFirst: vi.fn(),
  update: vi.fn(),
}

const mockModel = {
  findMany: vi.fn(),
  findFirst: vi.fn(),
  update: vi.fn(),
  createMany: vi.fn(),
}

const mockCampaignUpdateHistoryModel = {
  create: vi.fn(),
  delete: vi.fn(),
  findUniqueOrThrow: vi.fn(),
}

const mockCampaignModel = {
  findUniqueOrThrow: vi.fn(),
  update: vi.fn(),
}

const mockTransaction = vi.fn(
  async (callback: (tx: unknown) => Promise<unknown>) => {
    return callback({
      campaignTask: mockTxModel,
      campaignUpdateHistory: mockCampaignUpdateHistoryModel,
      campaign: mockCampaignModel,
      $executeRaw: vi.fn(),
    })
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

const makeCampaign = (
  overrides: Partial<CampaignWithPathToVictory> = {},
): CampaignWithPathToVictory =>
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
    pathToVictory: null,
    ...overrides,
  }) as CampaignWithPathToVictory

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
        campaignUpdateHistory: mockCampaignUpdateHistoryModel,
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
    it('marks task as completed without voter contact', async () => {
      const task = makeDbTask()
      const updatedTask = { ...task, completed: true }
      mockTxModel.findFirst = vi.fn().mockResolvedValue(task)
      mockTxModel.update = vi.fn().mockResolvedValue(updatedTask)

      const result = await service.completeTask(makeCampaign(), 'task-1')

      expect(mockTxModel.update).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: { completed: true },
      })
      expect(result).toEqual(updatedTask)
    })

    it('throws NotFoundException when task not found', async () => {
      mockTxModel.findFirst = vi.fn().mockResolvedValue(null)

      await expect(
        service.completeTask(makeCampaign(), 'missing'),
      ).rejects.toThrow(NotFoundException)
    })

    it('returns task as-is when already completed', async () => {
      const task = makeDbTask({ completed: true })
      mockTxModel.findFirst = vi.fn().mockResolvedValue(task)
      mockTxModel.update = vi.fn()

      const result = await service.completeTask(makeCampaign(), 'task-1')

      expect(result).toEqual(task)
      expect(mockTxModel.update).not.toHaveBeenCalled()
    })

    it('creates update history and increments voter goals when voterContact provided', async () => {
      const task = makeDbTask({
        flowType: CampaignUpdateHistoryType.doorKnocking,
      })
      const updatedTask = {
        ...task,
        completed: true,
        updateHistoryId: 42,
      }
      mockTxModel.findFirst = vi.fn().mockResolvedValue(task)
      mockTxModel.update = vi.fn().mockResolvedValue(updatedTask)
      mockCampaignUpdateHistoryModel.create.mockResolvedValue({
        id: 42,
      })
      mockCampaignModel.findUniqueOrThrow.mockResolvedValue({
        id: 1,
        data: {
          reportedVoterGoals: {
            [CampaignUpdateHistoryType.doorKnocking]: 5,
          },
        },
      })
      mockCampaignModel.update.mockResolvedValue({})

      const result = await service.completeTask(makeCampaign(), 'task-1', {
        type: CampaignUpdateHistoryType.doorKnocking,
        quantity: 10,
      })

      expect(mockCampaignUpdateHistoryModel.create).toHaveBeenCalledWith({
        data: {
          type: CampaignUpdateHistoryType.doorKnocking,
          quantity: 10,
          campaignId: 1,
          userId: 123,
        },
      })
      expect(mockCampaignModel.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          data: {
            reportedVoterGoals: {
              [CampaignUpdateHistoryType.doorKnocking]: 15,
            },
          },
        },
      })
      expect(mockTxModel.update).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: { completed: true, updateHistoryId: 42 },
      })
      expect(result).toEqual(updatedTask)
    })

    it('initializes reportedVoterGoals when none exist yet', async () => {
      const task = makeDbTask({
        flowType: CampaignUpdateHistoryType.text,
      })
      const updatedTask = {
        ...task,
        completed: true,
        updateHistoryId: 99,
      }
      mockTxModel.findFirst = vi.fn().mockResolvedValue(task)
      mockTxModel.update = vi.fn().mockResolvedValue(updatedTask)
      mockCampaignUpdateHistoryModel.create.mockResolvedValue({
        id: 99,
      })
      mockCampaignModel.findUniqueOrThrow.mockResolvedValue({
        id: 1,
        data: {},
      })
      mockCampaignModel.update.mockResolvedValue({})

      const result = await service.completeTask(makeCampaign(), 'task-1', {
        type: CampaignUpdateHistoryType.text,
        quantity: 5,
      })

      expect(mockCampaignModel.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          data: {
            reportedVoterGoals: {
              [CampaignUpdateHistoryType.text]: 5,
            },
          },
        },
      })
      expect(result).toEqual(updatedTask)
    })

    it('adds new type key when reportedVoterGoals exists but lacks the type', async () => {
      const task = makeDbTask({
        flowType: CampaignUpdateHistoryType.phoneBanking,
      })
      const updatedTask = {
        ...task,
        completed: true,
        updateHistoryId: 77,
      }
      mockTxModel.findFirst = vi.fn().mockResolvedValue(task)
      mockTxModel.update = vi.fn().mockResolvedValue(updatedTask)
      mockCampaignUpdateHistoryModel.create.mockResolvedValue({
        id: 77,
      })
      mockCampaignModel.findUniqueOrThrow.mockResolvedValue({
        id: 1,
        data: {
          reportedVoterGoals: {
            [CampaignUpdateHistoryType.doorKnocking]: 10,
          },
        },
      })
      mockCampaignModel.update.mockResolvedValue({})

      const result = await service.completeTask(makeCampaign(), 'task-1', {
        type: CampaignUpdateHistoryType.phoneBanking,
        quantity: 3,
      })

      expect(mockCampaignModel.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          data: {
            reportedVoterGoals: {
              [CampaignUpdateHistoryType.doorKnocking]: 10,
              [CampaignUpdateHistoryType.phoneBanking]: 3,
            },
          },
        },
      })
      expect(result).toEqual(updatedTask)
    })
  })

  describe('unCompleteTask', () => {
    it('marks task as uncompleted without history', async () => {
      const task = makeDbTask({
        completed: true,
        updateHistoryId: null,
      })
      const updatedTask = { ...task, completed: false }
      mockTxModel.findFirst = vi.fn().mockResolvedValue(task)
      mockTxModel.update = vi.fn().mockResolvedValue(updatedTask)

      const result = await service.unCompleteTask(makeCampaign(), 'task-1')

      expect(mockTxModel.update).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: { completed: false, updateHistoryId: null },
      })
      expect(result).toEqual(updatedTask)
    })

    it('throws NotFoundException when task not found', async () => {
      mockTxModel.findFirst = vi.fn().mockResolvedValue(null)

      await expect(
        service.unCompleteTask(makeCampaign(), 'missing'),
      ).rejects.toThrow(NotFoundException)
    })

    it('returns task as-is when already uncompleted', async () => {
      const task = makeDbTask({ completed: false })
      mockTxModel.findFirst = vi.fn().mockResolvedValue(task)
      mockTxModel.update = vi.fn()

      const result = await service.unCompleteTask(makeCampaign(), 'task-1')

      expect(result).toEqual(task)
      expect(mockTxModel.update).not.toHaveBeenCalled()
    })

    it('deletes history and decrements voter goals when history exists', async () => {
      const task = makeDbTask({
        completed: true,
        updateHistoryId: 42,
      })
      const updatedTask = {
        ...task,
        completed: false,
        updateHistoryId: null,
      }
      mockTxModel.findFirst = vi.fn().mockResolvedValue(task)
      mockCampaignUpdateHistoryModel.findUniqueOrThrow.mockResolvedValue({
        id: 42,
        type: CampaignUpdateHistoryType.doorKnocking,
        quantity: 10,
      })
      mockTxModel.update = vi.fn().mockResolvedValue(updatedTask)
      mockCampaignModel.findUniqueOrThrow.mockResolvedValue({
        id: 1,
        data: {
          reportedVoterGoals: {
            [CampaignUpdateHistoryType.doorKnocking]: 15,
          },
        },
      })
      mockCampaignModel.update.mockResolvedValue({})
      mockCampaignUpdateHistoryModel.delete.mockResolvedValue({})

      const result = await service.unCompleteTask(makeCampaign(), 'task-1')

      expect(mockCampaignModel.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          data: {
            reportedVoterGoals: {
              [CampaignUpdateHistoryType.doorKnocking]: 5,
            },
          },
        },
      })
      expect(mockCampaignUpdateHistoryModel.delete).toHaveBeenCalledWith({
        where: { id: 42 },
      })
      expect(mockTxModel.update).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: { completed: false, updateHistoryId: null },
      })
      expect(result).toEqual(updatedTask)
    })

    it('floors voter goals at 0 when decrementing', async () => {
      const task = makeDbTask({
        completed: true,
        updateHistoryId: 42,
      })
      mockTxModel.findFirst = vi.fn().mockResolvedValue(task)
      mockCampaignUpdateHistoryModel.findUniqueOrThrow.mockResolvedValue({
        id: 42,
        type: CampaignUpdateHistoryType.text,
        quantity: 100,
      })
      mockTxModel.update = vi.fn().mockResolvedValue({
        ...task,
        completed: false,
      })
      mockCampaignModel.findUniqueOrThrow.mockResolvedValue({
        id: 1,
        data: {
          reportedVoterGoals: {
            [CampaignUpdateHistoryType.text]: 5,
          },
        },
      })
      mockCampaignModel.update.mockResolvedValue({})
      mockCampaignUpdateHistoryModel.delete.mockResolvedValue({})

      await service.unCompleteTask(makeCampaign(), 'task-1')

      expect(mockCampaignModel.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          data: {
            reportedVoterGoals: {
              [CampaignUpdateHistoryType.text]: 0,
            },
          },
        },
      })
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

      mockTxModel.count.mockResolvedValueOnce(1)
      mockModel.findMany.mockResolvedValueOnce(savedTasks)
      mockTxModel.deleteMany.mockResolvedValue({ count: 0 })
      mockTxModel.createMany.mockResolvedValue({ count: 1 })
      vi.mocked(mockAiIntegration.generateCampaignTasks!).mockResolvedValue(
        aiTasks,
      )

      const result = await service.generateTasks(makeCampaign())

      expect(mockAiIntegration.generateCampaignTasks).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1, slug: 'test-campaign' }),
      )
      expect(mockTransaction).toHaveBeenCalled()
      expect(result).toEqual(savedTasks)
    })

    it('falls back to empty tasks on AI failure', async () => {
      const savedTasks = [makeDbTask({ isDefaultTask: true })]

      mockTxModel.count.mockResolvedValueOnce(1)
      mockModel.findMany.mockResolvedValueOnce(savedTasks)
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

      mockTxModel.count.mockResolvedValueOnce(1)
      mockModel.findMany.mockResolvedValueOnce(savedTasks)
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

      mockTxModel.count.mockResolvedValueOnce(1)
      mockModel.findMany.mockResolvedValueOnce(savedTasks)
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

      mockTxModel.count.mockResolvedValueOnce(1)
      mockModel.findMany.mockResolvedValueOnce(savedTasks)
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
      mockTxModel.count.mockResolvedValueOnce(1)

      await service.generateDefaultTasks(makeCampaign())

      expect(mockTransaction).toHaveBeenCalled()
      expect(mockTxModel.deleteMany).not.toHaveBeenCalled()
      expect(mockTxModel.createMany).not.toHaveBeenCalled()
    })

    it('creates default tasks if none exist', async () => {
      mockTxModel.count.mockResolvedValueOnce(0)
      mockTxModel.deleteMany.mockResolvedValue({ count: 0 })
      mockTxModel.createMany.mockResolvedValue({ count: 1 })

      await service.generateDefaultTasks(makeCampaign())

      expect(mockTransaction).toHaveBeenCalled()
      expect(mockTxModel.createMany).toHaveBeenCalled()
      const createCall = mockTxModel.createMany.mock.calls[0][0]
      expect(createCall.data).toHaveLength(generalDefaultTasks.length)
      expect(createCall.data[0]).toMatchObject({
        campaignId: 1,
        title: generalDefaultTasks[0].title,
        isDefaultTask: true,
      })
    })
  })

  describe('generateDefaultTasks - task distribution', () => {
    const FAKE_TODAY = new Date('2025-06-01T00:00:00.000Z')
    const FUTURE_GENERAL = '2025-11-04'
    const FUTURE_PRIMARY = '2025-08-15'
    const PAST_PRIMARY = '2024-03-01'
    const PAST_GENERAL = '2024-11-04'

    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(FAKE_TODAY)
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    const setupForCreation = () => {
      mockTxModel.count.mockResolvedValueOnce(0)
      mockTxModel.deleteMany.mockResolvedValue({ count: 0 })
      mockTxModel.createMany.mockResolvedValue({ count: 1 })
    }

    const getCreatedTaskData = () => {
      const call = mockTxModel.createMany.mock.calls[0][0] as {
        data: {
          title: string
          date: Date | null
          week: number
          isDefaultTask: boolean
          campaignId: number
        }[]
      }
      return call.data
    }

    it('uses general tasks without dates when details is empty', async () => {
      setupForCreation()

      await service.generateDefaultTasks(makeCampaign({ details: {} }))

      const tasks = getCreatedTaskData()
      expect(tasks).toHaveLength(generalDefaultTasks.length)
      expect(tasks[0].title).toBe(generalDefaultTasks[0].title)
      expect(tasks[0].date).toBeNull()
    })

    it('distributes general tasks when only general date is future', async () => {
      setupForCreation()

      await service.generateDefaultTasks(
        makeCampaign({
          details: { electionDate: FUTURE_GENERAL },
        }),
      )

      const tasks = getCreatedTaskData()
      expect(tasks).toHaveLength(generalDefaultTasks.length)
      expect(tasks[0].title).toBe(generalDefaultTasks[0].title)
      tasks.forEach((task) => {
        expect(task.date).toBeInstanceOf(Date)
        expect(task.isDefaultTask).toBe(true)
      })
    })

    it('distributes primary tasks when only primary date is future', async () => {
      setupForCreation()

      await service.generateDefaultTasks(
        makeCampaign({
          details: { primaryElectionDate: FUTURE_PRIMARY },
        }),
      )

      const tasks = getCreatedTaskData()
      expect(tasks).toHaveLength(primaryDefaultTasks.length)
      expect(tasks[0].title).toBe(primaryDefaultTasks[0].title)
      tasks.forEach((task) => {
        expect(task.date).toBeInstanceOf(Date)
        expect(task.isDefaultTask).toBe(true)
      })
    })

    it('distributes both sets when both dates are future', async () => {
      setupForCreation()

      await service.generateDefaultTasks(
        makeCampaign({
          details: {
            primaryElectionDate: FUTURE_PRIMARY,
            electionDate: FUTURE_GENERAL,
          },
        }),
      )

      const tasks = getCreatedTaskData()
      expect(tasks).toHaveLength(
        primaryDefaultTasks.length + generalDefaultTasks.length,
      )
      expect(tasks[0].title).toBe(primaryDefaultTasks[0].title)
      expect(tasks[primaryDefaultTasks.length].title).toBe(
        generalDefaultTasks[0].title,
      )
      tasks.forEach((task) => {
        expect(task.date).toBeInstanceOf(Date)
        expect(task.isDefaultTask).toBe(true)
      })
    })

    it('returns empty when both dates are in the past', async () => {
      setupForCreation()

      await service.generateDefaultTasks(
        makeCampaign({
          details: {
            primaryElectionDate: PAST_PRIMARY,
            electionDate: PAST_GENERAL,
          },
        }),
      )

      const tasks = getCreatedTaskData()
      expect(tasks).toHaveLength(0)
    })

    it('returns empty when only general date is in the past', async () => {
      setupForCreation()

      await service.generateDefaultTasks(
        makeCampaign({
          details: { electionDate: PAST_GENERAL },
        }),
      )

      const tasks = getCreatedTaskData()
      expect(tasks).toHaveLength(0)
    })

    it('distributes only general when primary is past and general is future', async () => {
      setupForCreation()

      await service.generateDefaultTasks(
        makeCampaign({
          details: {
            primaryElectionDate: PAST_PRIMARY,
            electionDate: FUTURE_GENERAL,
          },
        }),
      )

      const tasks = getCreatedTaskData()
      expect(tasks).toHaveLength(generalDefaultTasks.length)
      expect(tasks[0].title).toBe(generalDefaultTasks[0].title)
    })

    it('distributes only primary when general is past and primary is future', async () => {
      setupForCreation()

      await service.generateDefaultTasks(
        makeCampaign({
          details: {
            primaryElectionDate: FUTURE_PRIMARY,
            electionDate: PAST_GENERAL,
          },
        }),
      )

      const tasks = getCreatedTaskData()
      expect(tasks).toHaveLength(primaryDefaultTasks.length)
      expect(tasks[0].title).toBe(primaryDefaultTasks[0].title)
    })

    it('assigns dates in chronological order', async () => {
      setupForCreation()

      await service.generateDefaultTasks(
        makeCampaign({
          details: { electionDate: FUTURE_GENERAL },
        }),
      )

      const tasks = getCreatedTaskData()
      for (let i = 1; i < tasks.length; i++) {
        expect(tasks[i].date!.getTime()).toBeGreaterThanOrEqual(
          tasks[i - 1].date!.getTime(),
        )
      }
    })

    it('assigns decreasing weeks for tasks closer to election', async () => {
      setupForCreation()

      await service.generateDefaultTasks(
        makeCampaign({
          details: { electionDate: FUTURE_GENERAL },
        }),
      )

      const tasks = getCreatedTaskData()
      for (let i = 1; i < tasks.length; i++) {
        expect(tasks[i].week).toBeLessThanOrEqual(tasks[i - 1].week)
      }
    })

    it('produces consistent weeks regardless of server time-of-day', async () => {
      vi.setSystemTime(new Date('2025-06-01T14:30:00.000Z'))
      setupForCreation()

      await service.generateDefaultTasks(
        makeCampaign({
          details: { electionDate: FUTURE_GENERAL },
        }),
      )

      const midDayTasks = getCreatedTaskData()

      vi.clearAllMocks()
      vi.setSystemTime(new Date('2025-06-01T00:00:00.000Z'))
      setupForCreation()

      await service.generateDefaultTasks(
        makeCampaign({
          details: { electionDate: FUTURE_GENERAL },
        }),
      )

      const midnightTasks = getCreatedTaskData()

      expect(midDayTasks).toHaveLength(midnightTasks.length)
      midDayTasks.forEach((task, i) => {
        expect(task.week).toBe(midnightTasks[i].week)
        expect(task.date!.getTime()).toBe(midnightTasks[i].date!.getTime())
      })
    })

    it('treats election date equal to today as future', async () => {
      setupForCreation()

      await service.generateDefaultTasks(
        makeCampaign({
          details: { electionDate: '2025-06-01' },
        }),
      )

      const tasks = getCreatedTaskData()
      expect(tasks).toHaveLength(generalDefaultTasks.length)
      tasks.forEach((task) => {
        expect(task.date).toBeInstanceOf(Date)
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
})
