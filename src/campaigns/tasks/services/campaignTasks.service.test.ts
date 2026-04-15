import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NotFoundException } from '@nestjs/common'
import { CampaignWithPathToVictory } from '../../campaigns.types'
import { CampaignTask, CampaignTaskType } from '../campaignTasks.types'
import { firstValueFrom, toArray } from 'rxjs'
import { CampaignTasksService } from './campaignTasks.service'
import { AiGenerationService } from './aiGeneration.service'
import { CampaignUpdateHistoryType, Prisma } from '@prisma/client'
import { startOfDay } from 'date-fns'
import { parseIsoDateString } from '@/shared/util/date.util'
import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
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
  count: vi.fn(),
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

const mockAiGeneration: Partial<AiGenerationService> = {
  triggerEventGeneration: vi.fn(),
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
    service = new CampaignTasksService(mockAiGeneration as AiGenerationService)
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

  describe('generateTasksStream', () => {
    it('returns existing tasks immediately when not triggered', async () => {
      const existingTasks = [makeDbTask({ id: 'existing-1' })]

      mockTxModel.count.mockResolvedValueOnce(1)
      mockModel.findMany.mockResolvedValueOnce(existingTasks)
      vi.mocked(mockAiGeneration.triggerEventGeneration!).mockResolvedValue(
        false,
      )

      const observable = service.generateTasksStream(makeCampaign())
      const events = await firstValueFrom(observable.pipe(toArray()))

      const completeEvent = events.find(
        (e) => (e.data as { type: string }).type === 'complete',
      )
      expect(completeEvent).toBeDefined()
      expect((completeEvent!.data as { tasks: unknown[] }).tasks).toEqual(
        existingTasks,
      )
    })

    it('polls DB for plan completion and returns tasks when plan exists', async () => {
      const savedTasks = [makeDbTask()]

      mockTxModel.count.mockResolvedValueOnce(1)
      mockTxModel.deleteMany.mockResolvedValue({ count: 0 })
      mockTxModel.createMany.mockResolvedValue({ count: 1 })
      mockModel.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(1)
      vi.mocked(mockAiGeneration.triggerEventGeneration!).mockResolvedValue(
        true,
      )
      mockModel.findMany.mockResolvedValue(savedTasks)

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

    it('handles error during stream and returns existing tasks', async () => {
      const existingTasks = [makeDbTask({ isDefaultTask: true })]

      mockTxModel.count.mockResolvedValueOnce(1)
      mockModel.findMany.mockResolvedValue(existingTasks)
      vi.mocked(mockAiGeneration.triggerEventGeneration!).mockRejectedValue(
        new Error('Lambda trigger failed'),
      )

      const observable = service.generateTasksStream(makeCampaign())
      const events = await firstValueFrom(observable.pipe(toArray()))

      const completeEvent = events.find(
        (e) => (e.data as { type: string }).type === 'complete',
      )
      expect(completeEvent).toBeDefined()
      expect((completeEvent!.data as { tasks: unknown[] }).tasks).toEqual(
        existingTasks,
      )
    })
  })

  describe('addTasks', () => {
    it('passes event task id to createMany for idempotent inserts', async () => {
      const tasks: CampaignTask[] = [
        {
          id: 'event-1-0-2026-04-10T00:00:00Z',
          title: 'Town Hall',
          description: 'Meet voters',
          cta: 'Attend event',
          flowType: CampaignTaskType.events,
          week: 10,
          date: '2026-08-15',
        },
      ]
      mockModel.createMany.mockResolvedValue({ count: 1 })

      await service.addTasks(1, tasks)

      expect(mockModel.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            id: 'event-1-0-2026-04-10T00:00:00Z',
            campaignId: 1,
            title: 'Town Hall',
          }),
        ],
        skipDuplicates: true,
      })
    })

    it('includes id from task when provided', async () => {
      const tasks: CampaignTask[] = [
        {
          id: 'any-custom-id-123',
          title: 'Custom Task',
          description: 'A task with custom id',
          cta: 'Get started',
          flowType: CampaignTaskType.education,
          week: 12,
        },
      ]
      mockModel.createMany.mockResolvedValue({ count: 1 })

      await service.addTasks(1, tasks)

      expect(mockModel.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            id: 'any-custom-id-123',
            campaignId: 1,
            title: 'Custom Task',
          }),
        ],
        skipDuplicates: true,
      })
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
})
