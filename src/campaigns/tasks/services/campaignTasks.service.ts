import {
  BadGatewayException,
  Injectable,
  MessageEvent,
  NotFoundException,
} from '@nestjs/common'
import { Campaign, Prisma } from '@prisma/client'
import { CampaignWithPathToVictory } from '../../campaigns.types'
import { Observable, Subscriber } from 'rxjs'

const CAMPAIGN_DEFAULT_TASKS_ADVISORY_LOCK_KEY = 918_273
const MAX_TASK_WINDOW_DAYS = 49
const SHORTENED_WINDOW_BUFFER_DAYS = 7
const FULL_WINDOW_THRESHOLD_DAYS = 56
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { QueueProducerService } from 'src/queue/producer/queueProducer.service'
import { MessageGroup, QueueType } from 'src/queue/queue.types'
import { AiCampaignManagerIntegrationService } from './aiCampaignManagerIntegration.service'
import { CampaignTask, ElectionPhase } from '../campaignTasks.types'
import { getDefaultTasks } from '../fixtures/defaultTasks'
import { sleep } from 'src/shared/util/sleep.util'
import {
  addDays,
  differenceInCalendarDays,
  differenceInWeeks,
  isAfter,
  isBefore,
  startOfDay,
} from 'date-fns'
import {
  DateFormats,
  formatDate,
  parseIsoDateString,
} from 'src/shared/util/date.util'

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
      orderBy: { week: 'desc' },
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

  async completeTask({ id: campaignId }: Campaign, id: string) {
    const task = await this.model.findFirst({
      where: {
        campaignId,
        id,
      },
    })
    if (!task) {
      throw new NotFoundException(`Task ${id} not found`)
    }

    return this.model.update({
      where: {
        id: task.id,
      },
      data: {
        completed: true,
      },
    })
  }

  async unCompleteTask({ id: campaignId }: Campaign, id: string) {
    const task = await this.model.findFirst({
      where: {
        campaignId,
        id,
      },
    })

    if (!task) {
      throw new NotFoundException(`Task ${id} not found`)
    }

    return this.model.update({
      where: {
        id: task.id,
      },
      data: {
        completed: false,
      },
    })
  }

  async generateTasks(campaign: CampaignWithPathToVictory) {
    try {
      await this.generateDefaultTasks(campaign)
      const generatedTasks =
        await this.aiCampaignManagerIntegration.generateCampaignTasks(campaign)

      return this.saveTasks(campaign.id, generatedTasks)
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
        const savedTasks = await this.saveTasks(campaign.id, result.tasks)
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

        if (progress) {
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
            const savedTasks = await this.saveTasks(campaign.id, generatedTasks)
            subscriber.next({
              data: { type: 'complete', tasks: savedTasks },
            })
            subscriber.complete()
            return
          }

          if (progress.status === 'failed') {
            throw new Error('Campaign plan generation failed')
          }
        }

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

  async generateDefaultTasks(campaign: Campaign) {
    await this.client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CAMPAIGN_DEFAULT_TASKS_ADVISORY_LOCK_KEY}::integer, ${campaign.id}::integer)`
      const existingDefaults = await tx.campaignTask.count({
        where: { campaignId: campaign.id, isDefaultTask: true },
      })
      if (existingDefaults > 0) {
        return
      }

      const tasksForCampaign = this.orderDefaultTasksForCampaign(campaign)
      await this.replaceCampaignTasksInTransaction(
        tx,
        campaign.id,
        tasksForCampaign,
      )
    })
  }

  private orderDefaultTasksForCampaign(campaign: Campaign): CampaignTask[] {
    const today = startOfDay(new Date())
    const election = this.getElectionEndDate(campaign, today)
    if (!election) {
      return getDefaultTasks('general')
    }

    const { endDate, phase } = election
    const tasks = getDefaultTasks(phase)

    const daysUntilElection = differenceInCalendarDays(endDate, today)

    const rawStartDate =
      daysUntilElection > FULL_WINDOW_THRESHOLD_DAYS
        ? addDays(endDate, -MAX_TASK_WINDOW_DAYS)
        : addDays(today, SHORTENED_WINDOW_BUFFER_DAYS)

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

  private getElectionEndDate(
    campaign: Campaign,
    today: Date,
  ): { endDate: Date; phase: ElectionPhase } | null {
    const { details } = campaign
    if (!details) return null

    if (details.primaryElectionDate) {
      const primaryDate = parseIsoDateString(details.primaryElectionDate)
      if (!isBefore(primaryDate, today)) {
        return { endDate: primaryDate, phase: 'primary' }
      }
    }

    if (details.electionDate) {
      return {
        endDate: parseIsoDateString(details.electionDate),
        phase: 'general',
      }
    }

    return null
  }

  private mapTasksToCreateData(
    campaignId: number,
    tasks: CampaignTask[],
  ): Prisma.CampaignTaskCreateManyInput[] {
    return tasks.map((task) => ({
      campaignId,
      title: task.title,
      description: task.description,
      cta: task.cta,
      flowType: task.flowType,
      week: task.week,
      date: task.date ? new Date(task.date) : null,
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
      orderBy: { week: 'desc' },
    })
  }
}
