import { Injectable } from '@nestjs/common'
import { Campaign, Prisma } from '@prisma/client'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { AiCampaignManagerIntegrationService } from './aiCampaignManagerIntegration.service'
import { CampaignTask } from '../campaignTasks.types'
import { defaultTasks } from '../fixures/defaultTasks'

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
    { id: campaignId }: Campaign,
    _currentDate?: Date,
    _endDate?: Date,
  ) {
    const where: Prisma.CampaignTaskWhereInput = { campaignId }

    return this.model.findMany({ where })
  }

  async getCampaignTaskById(campaignId: number, taskId: number) {
    return this.model.findFirst({
      where: {
        campaignId,
        id: taskId,
      },
    })
  }

  async completeTask({ id: campaignId }: Campaign, taskId: number) {
    const task = await this.model.findFirst({
      where: {
        campaignId,
        id: taskId,
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

  async unCompleteTask({ id: campaignId }: Campaign, taskId: number) {
    const task = await this.model.findFirst({
      where: {
        campaignId,
        id: taskId,
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

    const tasksToCreate = [...defaultTasks, ...tasks].map((task) => ({
      campaignId,
      title: task.title,
      description: task.description,
      cta: task.cta,
      flowType: task.flowType,
      link: task.link,
      completed: false,
    }))

    await this.model.createMany({
      data: tasksToCreate,
    })

    return this.model.findMany({
      where: { campaignId },
      orderBy: { id: 'asc' },
    })
  }

  async clearTasks(campaignId: number): Promise<void> {
    await this.model.deleteMany({
      where: { campaignId },
    })
  }
}
