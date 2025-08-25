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

  async unCompleteTask({ id: campaignId }: Campaign, id: string) {
    const task = await this.model.findFirst({
      where: {
        campaignId,
        id,
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
      const generatedTasks =
        await this.aiCampaignManagerIntegration.generateCampaignTasks(campaign)

      return this.saveTasks(campaign.id, generatedTasks)
    } catch (_error) {
      try {
        return await this.saveTasks(campaign.id, [])
      } catch (fallbackError) {
        throw fallbackError
      }
    }
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
      week: task.week,
      date: task.date ? new Date(task.date) : null,
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
