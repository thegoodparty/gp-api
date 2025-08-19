import { Injectable } from '@nestjs/common'
import { Campaign, Prisma } from '@prisma/client'
import { parse, differenceInWeeks } from 'date-fns'
import { DateFormats } from '../../../shared/util/date.util'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { AiCampaignManagerIntegrationService } from './aiCampaignManagerIntegration.service'
import { CampaignTask } from '../campaignTasks.types'

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
        taskId,
      },
    })
  }

  async completeTask({ id: campaignId }: Campaign, taskId: string) {
    const task = await this.model.findFirst({
      where: {
        campaignId,
        taskId,
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
        taskId,
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
    const generatedTasks =
      await this.aiCampaignManagerIntegration.generateCampaignTasks(campaign)

    return this.saveTasks(campaign.id, generatedTasks)
  }

  async saveTasks(campaignId: number, tasks: CampaignTask[]) {
    await this.model.deleteMany({
      where: { campaignId },
    })

    const tasksToCreate = tasks.map((task) => ({
      taskId: task.id,
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

    await this.model.createMany({
      data: tasksToCreate,
    })

    // Return the created tasks
    return this.model.findMany({
      where: { campaignId },
      orderBy: { week: 'desc' },
    })
  }

  async clearTasks(campaignId: number): Promise<void> {
    await this.model.deleteMany({
      where: { campaignId },
    })
  }
}
