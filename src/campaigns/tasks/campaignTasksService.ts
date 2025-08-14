import { Injectable } from '@nestjs/common'
import { Campaign, Prisma } from '@prisma/client'
import { parse, differenceInWeeks } from 'date-fns'
import { DateFormats } from '../../shared/util/date.util'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'

const MAX_WEEK_NUMBER = 9

@Injectable()
export class CampaignTasksService extends createPrismaBase(
  MODELS.CampaignTask,
) {
  constructor() {
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

  async generateTasks(_campaignId: number) {
    return []
  }
}
