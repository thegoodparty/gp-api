import { Injectable } from '@nestjs/common'
import { Campaign, Prisma } from '@prisma/client'
import { parse, differenceInWeeks } from 'date-fns'
import { DateFormats } from '../../../shared/util/date.util'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { AiCampaignManagerIntegrationService } from './aiCampaignManagerIntegration.service'
import { CampaignTask } from '../campaignTasks.types'
import { defaultTasks } from '../fixures/defaultTasks'

const MAX_WEEK_NUMBER = 9

@Injectable()
export class CampaignTasksService extends createPrismaBase(
  MODELS.CampaignTask,
) {
  constructor(
    private readonly aiCampaignManagerIntegration: AiCampaignManagerIntegrationService,
  ) {
    super()
  }

  async listCampaignTasks(
    { id: campaignId, details }: Campaign,
    currentDate?: Date,
    endDate?: Date,
  ) {
    const where: Prisma.CampaignTaskWhereInput = { campaignId }

    if (currentDate) {
      const { electionDate: electionDateStr } = details
      const electionDate =
        endDate || parse(electionDateStr!, DateFormats.isoDate, currentDate)

      const weekNumber = Math.min(
        Math.max(1, differenceInWeeks(electionDate, currentDate)),
        MAX_WEEK_NUMBER,
      )

      where.week = weekNumber
    }

    return this.model.findMany({ where })
  }

  async getCampaignTaskById(campaignId: number, taskId: string) {
    return this.model.findFirst({
      where: {
        campaignId,
        taskId: `${campaignId}-${taskId}`,
      },
    })
  }

  async completeTask({ id: campaignId }: Campaign, taskId: string) {
    const task = await this.model.findFirst({
      where: {
        campaignId,
        taskId: `${campaignId}-${taskId}`,
      },
    })

    if (!task) {
      return null
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

  async unCompleteTask({ id: campaignId }: Campaign, taskId: string) {
    const task = await this.model.findFirst({
      where: {
        campaignId,
        taskId: `${campaignId}-${taskId}`,
      },
    })

    if (!task) {
      return null
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

  async generateTasks(campaign: Campaign) {
    try {
      console.log(`Starting task generation for campaign ${campaign.id}`)

      const generatedTasks =
        await this.aiCampaignManagerIntegration.generateCampaignTasks(campaign)

      console.log(
        `AI generated ${generatedTasks.length} tasks for campaign ${campaign.id}:`,
        generatedTasks.map((t) => ({ id: t.id, title: t.title, week: t.week })),
      )

      const savedTasks = await this.saveTasks(campaign.id, generatedTasks)

      console.log(
        `Successfully saved ${savedTasks.length} total tasks for campaign ${campaign.id}`,
      )

      return savedTasks
    } catch (error) {
      console.error(
        `Failed to generate tasks for campaign ${campaign.id}:`,
        error,
      )

      console.log(
        `Attempting to save only default tasks for campaign ${campaign.id}`,
      )
      try {
        return await this.saveTasks(campaign.id, [])
      } catch (fallbackError) {
        console.error(
          `Even default task saving failed for campaign ${campaign.id}:`,
          fallbackError,
        )
        throw fallbackError
      }
    }
  }

  async saveTasks(campaignId: number, tasks: CampaignTask[]) {
    console.log(
      `Saving tasks for campaign ${campaignId}. AI tasks: ${tasks.length}, Default tasks: ${defaultTasks.length}`,
    )

    try {
      const deletedCount = await this.model.deleteMany({
        where: { campaignId },
      })
      console.log(
        `Deleted ${deletedCount.count} existing tasks for campaign ${campaignId}`,
      )

      const tasksToCreate = [...defaultTasks, ...tasks].map((task) => ({
        taskId: `${campaignId}-${task.id}`,
        campaignId,
        title: task.title,
        description: task.description,
        cta: task.cta,
        flowType: task.flowType,
        week: task.week,
        link: task.link,
        proRequired: task.proRequired || false,
        deadline: task.deadline,
        defaultAiTemplateId: task.defaultAiTemplateId,
        completed: false,
      }))

      console.log(
        `Attempting to create ${tasksToCreate.length} tasks for campaign ${campaignId}`,
      )
      console.log(
        'Task IDs being created:',
        tasksToCreate.map((t) => t.taskId),
      )

      const createResult = await this.model.createMany({
        data: tasksToCreate,
      })

      console.log(
        `Successfully created ${createResult.count} tasks for campaign ${campaignId}`,
      )

      // Return the created tasks
      const finalTasks = await this.model.findMany({
        where: { campaignId },
        orderBy: { week: 'desc' },
      })

      console.log(
        `Found ${finalTasks.length} tasks in database for campaign ${campaignId}`,
      )

      return finalTasks
    } catch (error) {
      console.error(`Error in saveTasks for campaign ${campaignId}:`, error)
      throw error
    }
  }

  async clearTasks(campaignId: number): Promise<void> {
    await this.model.deleteMany({
      where: { campaignId },
    })
  }

  async testSaveDefaultTasks(campaignId: number) {
    console.log(`Testing default task saving for campaign ${campaignId}`)
    try {
      const result = await this.saveTasks(campaignId, [])
      console.log(`Test successful! Saved ${result.length} default tasks`)
      return result
    } catch (error) {
      console.error(`Test failed for campaign ${campaignId}:`, error)
      throw error
    }
  }
}
