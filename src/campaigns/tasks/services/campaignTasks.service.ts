import {
  BadGatewayException,
  Injectable,
  MessageEvent,
  NotFoundException,
} from '@nestjs/common'
import { Campaign, Prisma } from '@prisma/client'
import {
  addDays,
  differenceInCalendarDays,
  differenceInWeeks,
  getDate,
  getDay,
  isAfter,
  isBefore,
  startOfDay,
  startOfWeek,
  subWeeks,
} from 'date-fns'
import { Observable, Subscriber } from 'rxjs'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { QueueProducerService } from 'src/queue/producer/queueProducer.service'
import { MessageGroup, QueueType } from 'src/queue/queue.types'
import {
  DateFormats,
  formatDate,
  parseIsoDateString,
} from 'src/shared/util/date.util'
import { sleep } from 'src/shared/util/sleep.util'
import { ProgressStreamData } from '../aiCampaignManager.types'
import {
  CampaignTask,
  CampaignTaskType,
  DayOfWeek,
  RecurrenceRule,
  RecurringTaskTemplate,
} from '../campaignTasks.types'
import { generalAwarenessTasks } from '../fixtures/defaultAwarenessTasks'
import { defaultRecurringTasks } from '../fixtures/defaultRecurringTasks'
import { generalDefaultTasks } from '../fixtures/defaultTasks'
import { primaryDefaultTasks } from '../fixtures/defaultTasksForPrimary'
import { CampaignWithPathToVictory } from '../../campaigns.types'
import { CompleteTaskBodySchema } from '../schemas/completeTaskBody.schema'
import { AiCampaignManagerIntegrationService } from './aiCampaignManagerIntegration.service'

const CAMPAIGN_DEFAULT_TASKS_ADVISORY_LOCK_KEY = 918_273
const VOTER_GOALS_ADVISORY_LOCK_KEY = 918_274
const MAX_TASK_WINDOW_DAYS = 49
const SHORTENED_WINDOW_BUFFER_DAYS = 7
const FULL_WINDOW_THRESHOLD_DAYS = 56

@Injectable()
export class CampaignTasksService extends createPrismaBase(
  MODELS.CampaignTask,
) {
  constructor(
    private readonly aiCampaignManagerIntegration: AiCampaignManagerIntegrationService,
    private readonly queueProducerService: QueueProducerService,
  ) {
    super()
  }

  async enqueueGenerateTasks(
    campaign: CampaignWithPathToVictory,
  ): Promise<{ accepted: true }> {
    try {
      await this.queueProducerService.sendMessage(
        {
          type: QueueType.GENERATE_TASKS,
          data: { campaignId: campaign.id },
        },
        MessageGroup.default,
        { throwOnError: true },
      )
    } catch {
      throw new BadGatewayException('Failed to queue task generation')
    }
    return { accepted: true }
  }

  async listCampaignTasks({ id: campaignId }: Campaign) {
    const where: Prisma.CampaignTaskWhereInput = { campaignId }

    return this.model.findMany({
      where,
      orderBy: [
        { week: Prisma.SortOrder.desc },
        { date: Prisma.SortOrder.asc },
        { id: Prisma.SortOrder.asc },
      ],
    })
  }

  async getCampaignTaskById(campaignId: number, id: string) {
    return this.model.findFirst({
      where: {
        campaignId,
        id,
      },
    })
  }

  async completeTask(
    { id: campaignId, userId }: Campaign,
    id: string,
    voterContact?: CompleteTaskBodySchema,
  ) {
    return this.client.$transaction(async (tx) => {
      if (voterContact) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${VOTER_GOALS_ADVISORY_LOCK_KEY}::integer, ${campaignId}::integer)`
      }

      const task = await tx.campaignTask.findFirst({
        where: { campaignId, id },
      })
      if (!task) {
        throw new NotFoundException(`Task ${id} not found`)
      }
      if (task.completed) {
        return task
      }

      let updateHistoryId: number | undefined

      if (voterContact) {
        const history = await tx.campaignUpdateHistory.create({
          data: {
            type: voterContact.type,
            quantity: voterContact.quantity,
            campaignId,
            userId,
          },
        })
        updateHistoryId = history.id

        const campaign = await tx.campaign.findUniqueOrThrow({
          where: { id: campaignId },
        })
        const { data } = campaign
        const reportedVoterGoals = (data.reportedVoterGoals || {}) as Record<
          string,
          number
        >
        reportedVoterGoals[voterContact.type] =
          (reportedVoterGoals[voterContact.type] || 0) + voterContact.quantity
        data.reportedVoterGoals = { ...reportedVoterGoals }

        await tx.campaign.update({
          where: { id: campaignId },
          data: { data },
        })
      }

      return tx.campaignTask.update({
        where: { id: task.id },
        data: {
          completed: true,
          ...(updateHistoryId !== undefined && { updateHistoryId }),
        },
      })
    })
  }

  async unCompleteTask({ id: campaignId }: Campaign, id: string) {
    return this.client.$transaction(async (tx) => {
      const task = await tx.campaignTask.findFirst({
        where: { campaignId, id },
      })
      if (!task) {
        throw new NotFoundException(`Task ${id} not found`)
      }
      if (!task.completed) {
        return task
      }

      const history = task.updateHistoryId
        ? await tx.campaignUpdateHistory.findUniqueOrThrow({
            where: { id: task.updateHistoryId },
            select: { id: true, type: true, quantity: true },
          })
        : null

      if (history) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${VOTER_GOALS_ADVISORY_LOCK_KEY}::integer, ${campaignId}::integer)`
        const campaign = await tx.campaign.findUniqueOrThrow({
          where: { id: campaignId },
        })
        const { data } = campaign
        const reportedVoterGoals = (data.reportedVoterGoals || {}) as Record<
          string,
          number
        >
        reportedVoterGoals[history.type] = Math.max(
          (reportedVoterGoals[history.type] || 0) - history.quantity,
          0,
        )
        data.reportedVoterGoals = { ...reportedVoterGoals }

        await tx.campaign.update({
          where: { id: campaignId },
          data: { data },
        })

        await tx.campaignUpdateHistory.delete({
          where: { id: history.id },
        })
      }

      return tx.campaignTask.update({
        where: { id: task.id },
        data: {
          completed: false,
          updateHistoryId: null,
        },
      })
    })
  }

  async generateTasks(campaign: CampaignWithPathToVictory) {
    try {
      await this.generateDefaultTasks(campaign)
      const generatedTasks =
        await this.aiCampaignManagerIntegration.generateCampaignTasks(campaign)
      const paradeTasks = this.buildParadeAwarenessTasks(
        generatedTasks,
        campaign.details.electionDate as string | undefined,
      )

      return this.saveTasks(campaign.id, [...generatedTasks, ...paradeTasks])
    } catch (error) {
      this.logger.error(
        { error, campaignId: campaign.id },
        'AI task generation failed, saving empty task set',
      )
      return this.saveTasks(campaign.id, [])
    }
  }

  generateTasksStream(
    campaign: CampaignWithPathToVictory,
  ): Observable<MessageEvent> {
    return new Observable((subscriber: Subscriber<MessageEvent>) => {
      this.runGenerationStream(campaign, subscriber).catch((error: Error) => {
        this.logger.error(
          { error, campaignId: campaign.id },
          'Task generation stream failed',
        )
        subscriber.next({
          data: { type: 'error', message: 'Task generation failed' },
        })
        subscriber.complete()
      })
    })
  }

  private async runGenerationStream(
    campaign: CampaignWithPathToVictory,
    subscriber: Subscriber<MessageEvent>,
  ): Promise<void> {
    await this.generateDefaultTasks(campaign)

    subscriber.next({
      data: {
        type: 'progress',
        progress: 0,
        message: 'Starting AI task generation...',
      },
    })

    try {
      const result =
        await this.aiCampaignManagerIntegration.startOrGetCached(campaign)

      if (result.cached) {
        const paradeTasks = this.buildParadeAwarenessTasks(
          result.tasks,
          campaign.details.electionDate as string | undefined,
        )
        const savedTasks = await this.saveTasks(campaign.id, [
          ...result.tasks,
          ...paradeTasks,
        ])
        subscriber.next({
          data: { type: 'complete', tasks: savedTasks },
        })
        subscriber.complete()
        return
      }

      const { sessionId } = result
      const pollIntervalMs = 5000
      const maxWaitTimeMs = 300000
      const startTime = Date.now()

      while (Date.now() - startTime < maxWaitTimeMs) {
        if (subscriber.closed) return

        const progress =
          await this.aiCampaignManagerIntegration.getLatestProgress(sessionId)

        if (!progress) {
          await sleep(pollIntervalMs)
          continue
        }

        const done = await this.handleStreamProgress(
          progress,
          sessionId,
          campaign,
          subscriber,
        )
        if (done) return

        await sleep(pollIntervalMs)
      }

      throw new Error('Campaign plan generation timed out')
    } catch (error) {
      if (subscriber.closed) return

      this.logger.error(
        { error, campaignId: campaign.id },
        'AI task generation failed during stream, saving empty task set',
      )
      const tasks = await this.saveTasks(campaign.id, [])
      subscriber.next({
        data: { type: 'complete', tasks },
      })
      subscriber.complete()
    }
  }

  private async handleStreamProgress(
    progress: ProgressStreamData,
    sessionId: string,
    campaign: CampaignWithPathToVictory,
    subscriber: Subscriber<MessageEvent>,
  ): Promise<boolean> {
    subscriber.next({
      data: {
        type: 'progress',
        progress: progress.progress,
        message: progress.message,
      },
    })

    if (progress.status === 'completed') {
      const generatedTasks =
        await this.aiCampaignManagerIntegration.finishGeneration(
          sessionId,
          campaign,
        )
      const paradeTasks = this.buildParadeAwarenessTasks(
        generatedTasks,
        campaign.details.electionDate as string | undefined,
      )
      const savedTasks = await this.saveTasks(campaign.id, [
        ...generatedTasks,
        ...paradeTasks,
      ])
      subscriber.next({
        data: { type: 'complete', tasks: savedTasks },
      })
      subscriber.complete()
      return true
    }

    if (progress.status === 'failed') {
      throw new Error('Campaign plan generation failed')
    }

    return false
  }

  async deleteAllTasks(campaignId: number) {
    await this.model.deleteMany({
      where: { campaignId },
    })
  }

  async generateDefaultTasks(
    campaign: Campaign,
    today = startOfDay(new Date()),
  ) {
    await this.client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CAMPAIGN_DEFAULT_TASKS_ADVISORY_LOCK_KEY}::integer, ${campaign.id}::integer)`
      const existingDefaults = await tx.campaignTask.count({
        where: { campaignId: campaign.id, isDefaultTask: true },
      })
      if (existingDefaults > 0) {
        return
      }

      const tasksForCampaign = this.orderDefaultTasksForCampaign(
        campaign,
        today,
      )
      await this.replaceCampaignTasksInTransaction(
        tx,
        campaign.id,
        tasksForCampaign,
      )
    })
  }

  private orderDefaultTasksForCampaign(
    campaign: Campaign,
    today: Date,
  ): CampaignTask[] {
    const { details } = campaign
    if (!details) return generalDefaultTasks

    const primaryDate = this.hasFutureDate(details.primaryElectionDate, today)
    const generalDate = this.hasFutureDate(details.electionDate, today)

    if (primaryDate && generalDate) {
      return this.sortTasksByDate([
        ...this.distributeTasksOverWindow(
          primaryDefaultTasks,
          today,
          primaryDate,
        ),
        ...this.distributeTasksOverWindow(
          generalDefaultTasks,
          primaryDate,
          generalDate,
        ),
        ...this.computeAwarenessTasks(
          generalAwarenessTasks,
          generalDate,
          today,
        ),
        ...this.computeRecurringTasks(
          defaultRecurringTasks,
          today,
          generalDate,
        ),
      ])
    }

    if (primaryDate) {
      return this.sortTasksByDate([
        ...this.distributeTasksOverWindow(
          primaryDefaultTasks,
          today,
          primaryDate,
        ),
        ...this.computeRecurringTasks(
          defaultRecurringTasks,
          today,
          primaryDate,
        ),
      ])
    }

    if (generalDate) {
      return this.sortTasksByDate([
        ...this.distributeTasksOverWindow(
          generalDefaultTasks,
          today,
          generalDate,
        ),
        ...this.computeAwarenessTasks(
          generalAwarenessTasks,
          generalDate,
          today,
        ),
        ...this.computeRecurringTasks(
          defaultRecurringTasks,
          today,
          generalDate,
        ),
      ])
    }

    const hasAnyElectionDate =
      details.primaryElectionDate || details.electionDate
    return hasAnyElectionDate ? [] : generalDefaultTasks
  }

  private hasFutureDate(
    dateString: string | undefined,
    today: Date,
  ): Date | null {
    if (!dateString) return null
    const date = startOfDay(parseIsoDateString(dateString))
    return isBefore(date, today) ? null : date
  }

  private distributeTasksOverWindow(
    tasks: CampaignTask[],
    windowStart: Date,
    endDate: Date,
  ): CampaignTask[] {
    const daysUntilEnd = differenceInCalendarDays(endDate, windowStart)

    const rawStartDate =
      daysUntilEnd > FULL_WINDOW_THRESHOLD_DAYS
        ? addDays(endDate, -MAX_TASK_WINDOW_DAYS)
        : addDays(windowStart, SHORTENED_WINDOW_BUFFER_DAYS)

    const startDate = isAfter(rawStartDate, endDate) ? endDate : rawStartDate

    const timeWindowDays = Math.min(
      MAX_TASK_WINDOW_DAYS,
      differenceInCalendarDays(endDate, startDate),
    )

    const taskCount = tasks.length
    return tasks.map((task, index) => {
      const taskDate =
        taskCount === 1
          ? endDate
          : addDays(
              startDate,
              Math.round((timeWindowDays * index) / (taskCount - 1)),
            )
      return {
        ...task,
        date: formatDate(taskDate, DateFormats.isoDate),
        week: differenceInWeeks(endDate, taskDate, {
          roundingMethod: 'ceil',
        }),
      }
    })
  }

  private sortTasksByDate(tasks: CampaignTask[]): CampaignTask[] {
    return [...tasks].sort((a, b) => {
      const dateA = a.date ? parseIsoDateString(a.date).getTime() : 0
      const dateB = b.date ? parseIsoDateString(b.date).getTime() : 0
      return dateA - dateB
    })
  }

  private computeAwarenessTasks(
    tasks: CampaignTask[],
    electionDate: Date,
    today: Date,
  ): CampaignTask[] {
    return tasks
      .map((task) => {
        const weekRef = subWeeks(electionDate, task.week)
        const saturday = addDays(startOfWeek(weekRef), 6)
        return {
          ...task,
          date: formatDate(saturday, DateFormats.isoDate),
        }
      })
      .filter((task) => !isBefore(parseIsoDateString(task.date), today))
  }

  private computeRecurringTasks(
    templates: RecurringTaskTemplate[],
    windowStart: Date,
    electionDate: Date,
  ): CampaignTask[] {
    return templates.flatMap((template) =>
      this.computeRecurrenceDates(
        template.recurrence,
        windowStart,
        electionDate,
      ).map((date) => ({
        id: `${template.id}-${formatDate(date, DateFormats.isoDate)}`,
        title: template.title,
        description: template.description,
        flowType: template.flowType ?? CampaignTaskType.recurring,
        proRequired: template.proRequired,
        defaultAiTemplateId: template.defaultAiTemplateId,
        week: differenceInWeeks(electionDate, date, {
          roundingMethod: 'ceil',
        }),
        date: formatDate(date, DateFormats.isoDate),
        isDefaultTask: true,
      })),
    )
  }

  private computeRecurrenceDates(
    recurrence: RecurrenceRule,
    windowStart: Date,
    electionDate: Date,
  ): Date[] {
    switch (recurrence.type) {
      case 'weekly':
        return this.getWeeklyDates(
          recurrence.dayOfWeek,
          windowStart,
          electionDate,
        )
      case 'monthlyNthDay':
        return this.getMonthlyNthDayDates(
          recurrence.dayOfWeek,
          recurrence.occurrences,
          windowStart,
          electionDate,
        )
      case 'weeksBeforeElection':
        return this.getSingleOccurrenceDate(
          recurrence.dayOfWeek,
          recurrence.weeksBefore,
          electionDate,
          windowStart,
        )
    }
  }

  private getWeeklyDates(dayOfWeek: DayOfWeek, start: Date, end: Date): Date[] {
    const dates: Date[] = []
    let current = this.nextOrSameDayOfWeek(start, dayOfWeek)
    while (!isAfter(current, end)) {
      dates.push(current)
      current = addDays(current, 7)
    }
    return dates
  }

  private getMonthlyNthDayDates(
    dayOfWeek: DayOfWeek,
    occurrences: number[],
    start: Date,
    end: Date,
  ): Date[] {
    const dates: Date[] = []
    let current = this.nextOrSameDayOfWeek(start, dayOfWeek)
    while (!isAfter(current, end)) {
      const weekOfMonth = Math.ceil(getDate(current) / 7)
      if (occurrences.includes(weekOfMonth)) {
        dates.push(current)
      }
      current = addDays(current, 7)
    }
    return dates
  }

  private getSingleOccurrenceDate(
    dayOfWeek: DayOfWeek,
    weeksBefore: number,
    electionDate: Date,
    windowStart: Date,
  ): Date[] {
    const weekRef = subWeeks(electionDate, weeksBefore)
    const date = addDays(startOfWeek(weekRef), dayOfWeek)
    return !isBefore(date, windowStart) && !isAfter(date, electionDate)
      ? [date]
      : []
  }

  private nextOrSameDayOfWeek(date: Date, dayOfWeek: DayOfWeek): Date {
    const currentDay = getDay(date)
    const daysUntil = (dayOfWeek - currentDay + 7) % 7
    return daysUntil === 0 ? date : addDays(date, daysUntil)
  }

  private buildParadeAwarenessTasks(
    aiTasks: CampaignTask[],
    electionDateString?: string,
    today = startOfDay(new Date()),
  ): CampaignTask[] {
    if (!electionDateString) return []

    const electionDate = startOfDay(parseIsoDateString(electionDateString))
    const paradePattern = /parade/i
    const minWeeksOut = 4

    return aiTasks.flatMap((task) => {
      if (!task.date) return []
      const matchesParade =
        paradePattern.test(task.title) || paradePattern.test(task.description)
      if (!matchesParade) return []

      const parsed = parseIsoDateString(task.date)
      if (isNaN(parsed.getTime())) return []

      const eventDate = startOfDay(parsed)
      if (differenceInCalendarDays(eventDate, today) < minWeeksOut * 7) {
        return []
      }

      const fourWeeksBefore = subWeeks(eventDate, minWeeksOut)
      const monday = startOfWeek(fourWeeksBefore, {
        weekStartsOn: 1,
      })

      if (isBefore(monday, today)) {
        return []
      }

      return [
        {
          id: `aw-parade-${task.id}`,
          title: `Contact Parade Organizers for ${task.title}`,
          description: 'Get signed up to march in the parade',
          flowType: CampaignTaskType.awareness,
          week: Math.max(
            1,
            differenceInWeeks(electionDate, monday, {
              roundingMethod: 'ceil',
            }),
          ),
          date: formatDate(monday, DateFormats.isoDate),
          isDefaultTask: false,
        },
      ]
    })
  }

  private mapTasksToCreateData(
    campaignId: number,
    tasks: CampaignTask[],
  ): Prisma.CampaignTaskCreateManyInput[] {
    return tasks.map((task) => ({
      id: task.id,
      campaignId,
      title: task.title,
      description: task.description,
      cta: task.cta ?? null,
      flowType: task.flowType ?? null,
      week: task.week,
      date: task.date ? startOfDay(parseIsoDateString(task.date)) : null,
      link: task.link,
      proRequired: task.proRequired || false,
      deadline: task.deadline,
      defaultAiTemplateId: task.defaultAiTemplateId,
      completed: false,
      isDefaultTask: task.isDefaultTask || false,
    }))
  }

  private async replaceCampaignTasksInTransaction(
    tx: Prisma.TransactionClient,
    campaignId: number,
    tasks: CampaignTask[],
  ) {
    const tasksToCreate = this.mapTasksToCreateData(campaignId, tasks)
    await tx.campaignTask.deleteMany({
      where: { campaignId, isDefaultTask: false },
    })
    await tx.campaignTask.createMany({
      data: tasksToCreate,
    })
  }

  async saveTasks(campaignId: number, tasks: CampaignTask[]) {
    await this.client.$transaction(async (tx) => {
      await this.replaceCampaignTasksInTransaction(tx, campaignId, tasks)
    })

    return this.model.findMany({
      where: { campaignId },
      orderBy: [
        { week: Prisma.SortOrder.desc },
        { date: Prisma.SortOrder.asc },
        { id: Prisma.SortOrder.asc },
      ],
    })
  }
}
