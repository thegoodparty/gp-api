import { Injectable } from '@nestjs/common'
import { Campaign } from '@prisma/client'
import { parse } from 'date-fns'
import { DateFormats } from '../../shared/util/date.util'
import { getCurrentWeekTillEndOfElectionDate } from './util/getCurrentWeekTillEndOfElectionDate.util'
import { STATIC_CAMPAIGN_TASKS } from './campaignTasks.consts'

@Injectable()
export class CampaignTasksService {
  private readonly fullTasksList = STATIC_CAMPAIGN_TASKS
  listCampaignTasks({ details }: Campaign, currentDate?: Date, endDate?: Date) {
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

    return this.getListOfTasks(weekNumber)
  }

  getListOfTasks(weekNumber?: number) {
    return weekNumber
      ? this.fullTasksList.filter(({ week }) => week === weekNumber)
      : this.fullTasksList
  }
}
