import { Injectable } from '@nestjs/common'
import { Campaign } from '@prisma/client'
import { parse } from 'date-fns'
import { DateFormats } from '../../shared/util/date.util'
import { getCurrentWeekTillEndOfElectionDate } from './util/getCurrentWeekTillEndOfElectionDate.util'
import { STATIC_CAMPAIGN_TASKS } from './campaignTasks.consts'
import { CampaignsService } from '../services/campaigns.service'

@Injectable()
export class CampaignTasksService {
  private readonly fullTasksList = STATIC_CAMPAIGN_TASKS

  constructor(private readonly campaigns: CampaignsService) {}

  listCampaignTasks(
    { details, completedTaskIds }: Campaign,
    currentDate?: Date,
    endDate?: Date,
  ) {
    if (!currentDate) {
      return this.getListOfTasks()
    }
    const { electionDate: electionDateStr } = details
    const electionDate =
      endDate || parse(electionDateStr!, DateFormats.isoDate, currentDate)

    const weekNumber = getCurrentWeekTillEndOfElectionDate(
      currentDate,
      electionDate,
    )

    const tasks = this.getListOfTasks(weekNumber)
    return tasks.map((task) => ({
      ...task,
      completed: Boolean(completedTaskIds.includes(task.id)),
    }))
  }

  private getListOfTasks(weekNumber?: number) {
    return weekNumber
      ? this.fullTasksList.filter(({ week }) => week === weekNumber)
      : this.fullTasksList
  }

  getCampaignTaskById(taskId: string, completedTaskIds?: string[]) {
    return {
      ...this.fullTasksList.find(({ id }) => id === taskId)!,
      ...(completedTaskIds
        ? { completed: Boolean(completedTaskIds.includes(taskId)) }
        : {}),
    }
  }

  async completeTask({ id, completedTaskIds }: Campaign, taskId: string) {
    const updatedCompletedTaskIds = [...new Set([...completedTaskIds, taskId])]
    const updatedCampaign = await this.campaigns.update({
      where: {
        id,
      },
      data: {
        completedTaskIds: updatedCompletedTaskIds,
      },
    })

    return this.getCampaignTaskById(taskId, updatedCampaign.completedTaskIds)
  }

  async unCompleteTask({ id, completedTaskIds }: Campaign, taskId: string) {
    const updatedCompletedTaskIds = completedTaskIds.filter(
      (id) => id !== taskId,
    )
    const updatedCampaign = await this.campaigns.update({
      where: {
        id,
      },
      data: {
        completedTaskIds: updatedCompletedTaskIds,
      },
    })

    return this.getCampaignTaskById(taskId, updatedCampaign.completedTaskIds)
  }
}
