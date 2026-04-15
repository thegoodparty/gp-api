import { Injectable, MessageEvent, NotFoundException } from '@nestjs/common'
import { Campaign, Prisma } from '@prisma/client'
import {
  addDays,
  differenceInCalendarDays,
  differenceInWeeks,
  format,
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
import {
  DateFormats,
  formatDate,
  parseIsoDateString,
} from 'src/shared/util/date.util'
import { sleep } from 'src/shared/util/sleep.util'
import { SlackService } from 'src/vendors/slack/services/slack.service'
import {
  SlackChannel,
  SlackMessageType,
} from 'src/vendors/slack/slackService.types'
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
import { AiGenerationService } from './aiGeneration.service'

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
    private readonly aiGenerationService: AiGenerationService,
    private readonly slackService: SlackService,
  ) {
    super()
  }

  async nonDefaultTasksExist(campaignId: number): Promise<boolean> {
    const count = await this.model.count({
      where: { campaignId, isDefaultTask: false },
    })
    return count > 0
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
    try {
      await this.generateDefaultTasks(campaign)

      subscriber.next({
        data: {
          type: 'progress',
          progress: 0,
          message: 'Starting task generation...',
        },
      })
      const hasEventTasks = await this.nonDefaultTasksExist(campaign.id)
      if (hasEventTasks) {
        const tasks = await this.listCampaignTasks(campaign)
        subscriber.next({
          data: { type: 'complete', tasks },
        })
        subscriber.complete()
        return
      }

      const triggered =
        await this.aiGenerationService.triggerEventGeneration(campaign)

      // Something bad happened, let's close the stream.
      if (!triggered) {
        const tasks = await this.listCampaignTasks(campaign)
        subscriber.next({
          data: { type: 'complete', tasks },
        })
        subscriber.complete()
        return
      }

      const pollIntervalMs = 3000
      const maxWaitTimeMs = 120000
      const startTime = Date.now()

      while (Date.now() - startTime < maxWaitTimeMs) {
        if (subscriber.closed) return
        await sleep(pollIntervalMs)

        const exists = await this.nonDefaultTasksExist(campaign.id)

        if (exists) {
          const tasks = await this.listCampaignTasks(campaign)
          subscriber.next({
            data: { type: 'complete', tasks },
          })
          subscriber.complete()
          return
        }

        subscriber.next({
          data: { type: 'progress', progress: 0, message: 'Generating...' },
        })
      }

      this.logger.warn(
        { campaignId: campaign.id },
        'campaign plan generation poll timed out',
      )
      const tasks = await this.listCampaignTasks(campaign)
      subscriber.next({
        data: { type: 'complete', tasks },
      })
      subscriber.complete()
    } catch (error) {
      if (subscriber.closed) return

      this.logger.error(
        { error, campaignId: campaign.id },
        'task generation stream failed',
      )
      const tasks = await this.listCampaignTasks(campaign)
      subscriber.next({
        data: { type: 'complete', tasks },
      })
      subscriber.complete()
    }
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
    let created = false
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
      const tasksToCreate = this.mapTasksToCreateData(
        campaign.id,
        tasksForCampaign,
      )
      await tx.campaignTask.createMany({ data: tasksToCreate })
      created = true
    })

    if (created) {
      await this.notifySlackDefaultTasksCreated(campaign.id)
    }
  }

  async notifySlackDefaultTasksCreated(campaignId: number) {
    try {
      const campaign = await this.client.campaign.findUniqueOrThrow({
        where: { id: campaignId },
        include: { user: true, campaignTasks: true },
      })

      const candidateName =
        [campaign.user?.firstName, campaign.user?.lastName]
          .filter((value): value is string => Boolean(value))
          .join(' ') ||
        campaign.data.name ||
        'Unknown'

      const outreachTasks = campaign.campaignTasks.filter(
        (task) =>
          task.flowType === CampaignTaskType.text ||
          task.flowType === CampaignTaskType.robocall,
      )

      const taskLines = outreachTasks.map((task) => {
        const dueDate = task.date
          ? format(task.date, 'MMM d, yyyy')
          : 'No date set'
        return `- ${task.flowType!.toUpperCase()}: ${task.title} (Due: ${dueDate})`
      })

      const { hubspotId } = campaign.data

      const hubspotLink = hubspotId
        ? `<https://app.hubspot.com/contacts/21589597/record/0-2/${hubspotId}|${hubspotId}>`
        : 'N/A'

      const slackBody = [
        ':white_check_mark: *AI Campaign Plan Created*',
        `*Candidate:* ${candidateName}`,
        `*HubSpot ID:* ${hubspotLink}`,
        '',
        `*Outreach Tasks (${outreachTasks.length}):*`,
        ...(taskLines.length > 0 ? taskLines : ['None']),
      ].join('\n')

      await this.slackService.message(
        {
          blocks: [
            {
              type: SlackMessageType.SECTION,
              text: {
                type: SlackMessageType.MRKDWN,
                text: slackBody,
              },
            },
          ],
        },
        SlackChannel.casClickupTasks,
      )
    } catch (error) {
      this.logger.error(
        { error, campaignId },
        'Failed to send Slack notification for default tasks',
      )
    }
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

  private mapTasksToCreateData(
    campaignId: number,
    tasks: CampaignTask[],
  ): Prisma.CampaignTaskCreateManyInput[] {
    return tasks.map((task) => ({
      ...(task.id && { id: task.id }),
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

  async addTasks(campaignId: number, tasks: CampaignTask[]) {
    const tasksToCreate = this.mapTasksToCreateData(campaignId, tasks)
    await this.model.createMany({ data: tasksToCreate, skipDuplicates: true })
  }
}
