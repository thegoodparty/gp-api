import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BadGatewayException, NotFoundException } from '@nestjs/common'
import { CampaignWithPathToVictory } from '../../campaigns.types'
import { CampaignTaskType } from '../campaignTasks.types'
import { firstValueFrom, toArray } from 'rxjs'
import { CampaignTasksService } from './campaignTasks.service'
import { AiCampaignManagerIntegrationService } from './aiCampaignManagerIntegration.service'
import { QueueProducerService } from 'src/queue/producer/queueProducer.service'
import { CampaignUpdateHistoryType, Prisma } from '@prisma/client'
import { MessageGroup, QueueType } from 'src/queue/queue.types'
import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import { startOfDay } from 'date-fns'
import { parseIsoDateString } from '@/shared/util/date.util'
import { CampaignTask } from '../campaignTasks.types'
import { generalAwarenessTasks } from '../fixtures/defaultAwarenessTasks'
import { defaultRecurringTasks } from '../fixtures/defaultRecurringTasks'
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

const mockExecuteRaw = vi.fn()
const mockTransaction = vi.fn(
  async (callback: (tx: unknown) => Promise<unknown>) => {
    return callback({
      campaignTask: mockTxModel,
      campaignUpdateHistory: mockCampaignUpdateHistoryModel,
      campaign: mockCampaignModel,
      $executeRaw: mockExecuteRaw,
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
    it('Returns tasks ordered by week desc then date asc', async () => {
      const tasks = [makeDbTask({ week: 8 }), makeDbTask({ week: 4 })]
      mockModel.findMany.mockResolvedValue(tasks)

      const result = await service.listCampaignTasks(makeCampaign())

      expect(mockModel.findMany).toHaveBeenCalledWith({
        where: { campaignId: 1 },
        orderBy: [
          { week: Prisma.SortOrder.desc },
          { date: Prisma.SortOrder.asc },
          { id: Prisma.SortOrder.asc },
        ],
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

      expect(mockExecuteRaw).not.toHaveBeenCalled()
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

      expect(mockExecuteRaw).toHaveBeenCalled()
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

      expect(mockExecuteRaw).not.toHaveBeenCalled()
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

      expect(mockExecuteRaw).toHaveBeenCalled()
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
    const TODAY = startOfDay(parseIsoDateString('2025-06-01'))
    const FUTURE_GENERAL = '2025-11-04'
    const FUTURE_PRIMARY = '2025-08-15'
    const PAST_PRIMARY = '2024-03-01'
    const PAST_GENERAL = '2024-11-04'

    const setupForCreation = () => {
      mockTxModel.count.mockResolvedValueOnce(0)
      mockTxModel.deleteMany.mockResolvedValue({ count: 0 })
      mockTxModel.createMany.mockResolvedValue({ count: 1 })
    }

    const getCreatedTaskData = () => {
      const call = mockTxModel.createMany.mock.calls[0][0] as {
        data: {
          title: string
          description: string
          cta: string | null
          date: Date | null
          week: number
          link: string | undefined
          proRequired: boolean
          deadline: number | undefined
          defaultAiTemplateId: string | undefined
          completed: boolean
          isDefaultTask: boolean
          campaignId: number
          flowType: CampaignTaskType | null
        }[]
      }
      return call.data
    }

    const recurringTitles = new Set(defaultRecurringTasks.map((t) => t.title))

    const splitByRecurring = (
      tasks: ReturnType<typeof getCreatedTaskData>,
    ) => ({
      recurring: tasks.filter((t) => recurringTitles.has(t.title)),
      nonRecurring: tasks.filter((t) => !recurringTitles.has(t.title)),
    })

    it('uses general tasks without dates when details is empty', async () => {
      setupForCreation()

      await service.generateDefaultTasks(makeCampaign({ details: {} }), TODAY)

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
        TODAY,
      )

      const tasks = getCreatedTaskData()
      const { nonRecurring, recurring } = splitByRecurring(tasks)
      expect(nonRecurring).toHaveLength(
        generalDefaultTasks.length + generalAwarenessTasks.length,
      )
      expect(recurring).toHaveLength(169)
      expect(tasks[0].date).toBeInstanceOf(Date)
      expect(tasks[0].isDefaultTask).toBe(true)
      expect(tasks[tasks.length - 1].date).toBeInstanceOf(Date)
      expect(tasks[tasks.length - 1].isDefaultTask).toBe(true)
    })

    it('distributes primary tasks when only primary date is future', async () => {
      setupForCreation()

      await service.generateDefaultTasks(
        makeCampaign({
          details: { primaryElectionDate: FUTURE_PRIMARY },
        }),
        TODAY,
      )

      const tasks = getCreatedTaskData()
      const { nonRecurring, recurring } = splitByRecurring(tasks)
      expect(nonRecurring).toHaveLength(primaryDefaultTasks.length)
      expect(nonRecurring[0].title).toBe(primaryDefaultTasks[0].title)
      expect(recurring).toHaveLength(85)
      expect(tasks[0].date).toBeInstanceOf(Date)
      expect(tasks[0].isDefaultTask).toBe(true)
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
        TODAY,
      )

      const tasks = getCreatedTaskData()
      const { nonRecurring, recurring } = splitByRecurring(tasks)
      expect(nonRecurring).toHaveLength(
        primaryDefaultTasks.length +
          generalDefaultTasks.length +
          generalAwarenessTasks.length,
      )
      expect(recurring).toHaveLength(169)
      expect(tasks[0].date).toBeInstanceOf(Date)
      expect(tasks[0].isDefaultTask).toBe(true)
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
        TODAY,
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
        TODAY,
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
        TODAY,
      )

      const tasks = getCreatedTaskData()
      const { nonRecurring, recurring } = splitByRecurring(tasks)
      expect(nonRecurring).toHaveLength(
        generalDefaultTasks.length + generalAwarenessTasks.length,
      )
      expect(recurring).toHaveLength(169)
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
        TODAY,
      )

      const tasks = getCreatedTaskData()
      const { nonRecurring, recurring } = splitByRecurring(tasks)
      expect(nonRecurring).toHaveLength(primaryDefaultTasks.length)
      expect(nonRecurring[0].title).toBe(primaryDefaultTasks[0].title)
      expect(recurring).toHaveLength(85)
    })

    it('assigns dates in chronological order', async () => {
      setupForCreation()

      await service.generateDefaultTasks(
        makeCampaign({
          details: { electionDate: FUTURE_GENERAL },
        }),
        TODAY,
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
        TODAY,
      )

      const tasks = getCreatedTaskData()
      for (let i = 1; i < tasks.length; i++) {
        expect(tasks[i].week).toBeLessThanOrEqual(tasks[i - 1].week)
      }
    })

    it('treats election date equal to today as future with only general default tasks', async () => {
      setupForCreation()

      await service.generateDefaultTasks(
        makeCampaign({
          details: { electionDate: '2025-06-01' },
        }),
        TODAY,
      )

      const tasks = getCreatedTaskData()
      expect(tasks).toHaveLength(generalDefaultTasks.length)
      expect(tasks[0].date).toBeInstanceOf(Date)
      expect(tasks[0].isDefaultTask).toBe(true)
      expect(tasks[tasks.length - 1].date).toBeInstanceOf(Date)
    })

    it('generates weekly recurring tasks on the correct day each week', async () => {
      setupForCreation()

      await service.generateDefaultTasks(
        makeCampaign({
          details: { electionDate: '2025-06-15' },
        }),
        TODAY,
      )

      const { recurring } = splitByRecurring(getCreatedTaskData())
      const socialPosts = recurring.filter(
        (t) => t.title === 'Plan and Schedule 2 Social Posts for the week',
      )
      expect(socialPosts).toEqual([
        {
          campaignId: 1,
          title: 'Plan and Schedule 2 Social Posts for the week',
          description:
            'Keep your campaign visible! Plan and schedule two social posts to engage supporters and reach more voters.',
          cta: null,
          flowType: CampaignTaskType.recurring,
          week: 2,
          date: startOfDay(parseIsoDateString('2025-06-06')),
          link: undefined,
          proRequired: false,
          deadline: undefined,
          defaultAiTemplateId: undefined,
          completed: false,
          isDefaultTask: true,
        },
        {
          campaignId: 1,
          title: 'Plan and Schedule 2 Social Posts for the week',
          description:
            'Keep your campaign visible! Plan and schedule two social posts to engage supporters and reach more voters.',
          cta: null,
          flowType: CampaignTaskType.recurring,
          week: 1,
          date: startOfDay(parseIsoDateString('2025-06-13')),
          link: undefined,
          proRequired: false,
          deadline: undefined,
          defaultAiTemplateId: undefined,
          completed: false,
          isDefaultTask: true,
        },
      ])
    })

    it('generates monthlyNthDay recurring tasks on correct week-of-month occurrences', async () => {
      setupForCreation()

      await service.generateDefaultTasks(
        makeCampaign({
          details: { electionDate: '2025-06-22' },
        }),
        TODAY,
      )

      const { recurring } = splitByRecurring(getCreatedTaskData())
      const houseParty = recurring.filter(
        (t) => t.title === 'Organize a House Party with Supporters',
      )
      expect(houseParty).toEqual([
        {
          campaignId: 1,
          title: 'Organize a House Party with Supporters',
          description:
            'Work with your supporters to organize an informational house party where you can talk to voters directly.',
          cta: null,
          flowType: CampaignTaskType.recurring,
          week: 3,
          date: startOfDay(parseIsoDateString('2025-06-04')),
          link: undefined,
          proRequired: false,
          deadline: undefined,
          defaultAiTemplateId: undefined,
          completed: false,
          isDefaultTask: true,
        },
      ])

      const fundraiser = recurring.filter(
        (t) => t.title === 'Organize a Fundraiser',
      )
      expect(fundraiser).toEqual([
        {
          campaignId: 1,
          title: 'Organize a Fundraiser',
          description:
            'Work with your supporters to plan and organize a fundraiser to get the financial support you need',
          cta: null,
          flowType: CampaignTaskType.recurring,
          week: 2,
          date: startOfDay(parseIsoDateString('2025-06-10')),
          link: undefined,
          proRequired: false,
          deadline: undefined,
          defaultAiTemplateId: undefined,
          completed: false,
          isDefaultTask: true,
        },
      ])
    })

    it('generates weeksBeforeElection recurring task at the exact computed date', async () => {
      setupForCreation()

      await service.generateDefaultTasks(
        makeCampaign({
          details: { electionDate: FUTURE_GENERAL },
        }),
        TODAY,
      )

      const { recurring } = splitByRecurring(getCreatedTaskData())
      const lettersToEditor = recurring.filter(
        (t) =>
          t.title ===
          'Submit 2 Letters to the Editor in support of your campaign',
      )
      expect(lettersToEditor).toEqual([
        {
          campaignId: 1,
          title: 'Submit 2 Letters to the Editor in support of your campaign',
          description:
            'Have some of your supporters write some Letters to the Editor in support of your campaign to the local press.',
          cta: null,
          flowType: CampaignTaskType.recurring,
          week: 4,
          date: startOfDay(parseIsoDateString('2025-10-09')),
          link: undefined,
          proRequired: false,
          deadline: undefined,
          defaultAiTemplateId: undefined,
          completed: false,
          isDefaultTask: true,
        },
      ])
    })

    it('generates door-knocking recurring tasks with correct flowType and proRequired', async () => {
      setupForCreation()

      await service.generateDefaultTasks(
        makeCampaign({
          details: { electionDate: '2025-06-15' },
        }),
        TODAY,
      )

      const { recurring } = splitByRecurring(getCreatedTaskData())
      const doorKnocking = recurring.filter((t) => t.title === 'Knock on Doors')
      expect(doorKnocking.length).toBeGreaterThan(0)
      doorKnocking.forEach((t) => {
        expect(t.flowType).toBe(CampaignTaskType.doorKnocking)
        expect(t.proRequired).toBe(true)
        expect(t.defaultAiTemplateId).toBe('wgbnDDTxrf8OrresVE1HU')
        expect(t.isDefaultTask).toBe(true)
      })
    })

    it('generates phone-banking recurring tasks with correct flowType and proRequired', async () => {
      setupForCreation()

      await service.generateDefaultTasks(
        makeCampaign({
          details: { electionDate: '2025-06-15' },
        }),
        TODAY,
      )

      const { recurring } = splitByRecurring(getCreatedTaskData())
      const phoneBanking = recurring.filter(
        (t) => t.title === 'Make phone bank calls',
      )
      expect(phoneBanking.length).toBeGreaterThan(0)
      phoneBanking.forEach((t) => {
        expect(t.flowType).toBe(CampaignTaskType.phoneBanking)
        expect(t.proRequired).toBe(true)
        expect(t.defaultAiTemplateId).toBe('5N93cglp3cvq62EIwu1IOa')
        expect(t.isDefaultTask).toBe(true)
      })
    })

    it('generates all recurring task templates with correct total counts', async () => {
      setupForCreation()

      await service.generateDefaultTasks(
        makeCampaign({
          details: { electionDate: FUTURE_GENERAL },
        }),
        TODAY,
      )

      const { recurring } = splitByRecurring(getCreatedTaskData())
      expect(recurring).toHaveLength(169)

      const countByTitle = recurring.reduce<Record<string, number>>(
        (acc, t) => {
          acc[t.title] = (acc[t.title] || 0) + 1
          return acc
        },
        {},
      )

      expect(countByTitle).toEqual({
        'Plan and Schedule 2 Social Posts for the week': 22,
        'Social media update': 22,
        'Fundraising ask': 22,
        'Email update': 22,
        'Organize a House Party with Supporters': 5,
        'Organize a Fundraiser': 10,
        'Organize a Volunteer Voter Contact Event': 10,
        'Hold a Volunteer Voter Contact Event': 11,
        'Submit 2 Letters to the Editor in support of your campaign': 1,
        'Knock on Doors': 22,
        'Make phone bank calls': 22,
      })

      expect(recurring[0]).toMatchObject({
        isDefaultTask: true,
        campaignId: 1,
        completed: false,
      })
      expect(recurring[0].date).toBeInstanceOf(Date)
      expect(recurring[recurring.length - 1]).toMatchObject({
        isDefaultTask: true,
        campaignId: 1,
        completed: false,
      })
      expect(recurring[recurring.length - 1].date).toBeInstanceOf(Date)
    })

    it('does not generate recurring tasks when no election dates exist', async () => {
      setupForCreation()

      await service.generateDefaultTasks(makeCampaign({ details: {} }), TODAY)

      const { recurring } = splitByRecurring(getCreatedTaskData())
      expect(recurring).toHaveLength(0)
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
            date: startOfDay(parseIsoDateString('2025-11-01')),
            completed: false,
            isDefaultTask: false,
          }),
        ],
      })
      expect(mockModel.findMany).toHaveBeenCalledWith({
        where: { campaignId: 1 },
        orderBy: [
          { week: Prisma.SortOrder.desc },
          { date: Prisma.SortOrder.asc },
          { id: Prisma.SortOrder.asc },
        ],
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

  describe('buildParadeAwarenessTasks', () => {
    const today = startOfDay(parseIsoDateString('2026-01-05'))

    const makeAiTask = (
      overrides: Partial<CampaignTask> = {},
    ): CampaignTask => ({
      id: 'ai-task-1',
      title: 'Some Task',
      description: 'Some description',
      week: 4,
      date: '2026-03-15',
      ...overrides,
    })

    it('creates an awareness task for a parade event in the title', () => {
      const tasks = [
        makeAiTask({
          id: 'parade-1',
          title: '4th of July Parade',
          date: '2026-07-04',
        }),
      ]

      const result = service.buildParadeAwarenessTasks(tasks, today)

      expect(result).toHaveLength(1)
      expect(result[0].title).toBe(
        'Contact Parade Organizers for 4th of July Parade',
      )
      expect(result[0].description).toBe('Get signed up to march in the parade')
      expect(result[0].flowType).toBe(CampaignTaskType.awareness)
      expect(result[0].date).toBe('2026-06-01')
      expect(result[0].week).toBe(5)
      expect(result[0].isDefaultTask).toBe(false)
    })

    it('detects parade in the description (case-insensitive)', () => {
      const tasks = [
        makeAiTask({
          id: 'event-1',
          title: 'Community March Event',
          description: 'Join the local PARADE and wave to supporters',
          date: '2026-07-04',
        }),
      ]

      const result = service.buildParadeAwarenessTasks(tasks, today)

      expect(result).toHaveLength(1)
      expect(result[0].title).toBe(
        'Contact Parade Organizers for Community March Event',
      )
    })

    it('skips parade events less than 4 weeks out', () => {
      const tasks = [
        makeAiTask({
          id: 'parade-soon',
          title: 'Parade Tomorrow',
          date: '2026-01-20',
        }),
      ]

      const result = service.buildParadeAwarenessTasks(tasks, today)

      expect(result).toHaveLength(0)
    })

    it('skips tasks without a date', () => {
      const tasks = [
        makeAiTask({
          id: 'parade-no-date',
          title: 'Some Parade',
          date: undefined,
        }),
      ]

      const result = service.buildParadeAwarenessTasks(tasks, today)

      expect(result).toHaveLength(0)
    })

    it('skips non-parade tasks', () => {
      const tasks = [
        makeAiTask({
          id: 'normal-task',
          title: 'Door Knocking',
          description: 'Go knock on doors',
          date: '2026-07-04',
        }),
      ]

      const result = service.buildParadeAwarenessTasks(tasks, today)

      expect(result).toHaveLength(0)
    })

    it('handles multiple parade events', () => {
      const tasks = [
        makeAiTask({
          id: 'parade-1',
          title: 'Memorial Day Parade',
          date: '2026-05-25',
        }),
        makeAiTask({
          id: 'parade-2',
          title: 'Independence Day Parade',
          date: '2026-07-04',
        }),
        makeAiTask({
          id: 'normal',
          title: 'Phone Banking',
          date: '2026-06-01',
        }),
      ]

      const result = service.buildParadeAwarenessTasks(tasks, today)

      expect(result).toHaveLength(2)
      expect(result[0].id).toBe('aw-parade-parade-1')
      expect(result[1].id).toBe('aw-parade-parade-2')
    })
  })
})
