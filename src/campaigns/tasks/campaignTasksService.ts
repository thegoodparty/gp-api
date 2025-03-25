import { Injectable } from '@nestjs/common'
import { Campaign } from '@prisma/client'
import { parse } from 'date-fns'
import { DateFormats } from '../../shared/util/date.util'
import { getCurrentWeekTillEndOfElectionDate } from './util/getCurrentWeekTillEndOfElectionDate.util'
import { getListOfTasks } from './util/getListOfTasks.util'

@Injectable()
export class CampaignTasksService {
  listCampaignTasks({ details }: Campaign, currentDate?: Date, endDate?: Date) {
    if (!currentDate) {
      return getListOfTasks()
    }
    const { electionDate: electionDateStr } = details
    const electionDate =
      endDate || parse(electionDateStr!, DateFormats.isoDate, currentDate)

    const weekNumber = getCurrentWeekTillEndOfElectionDate(
      currentDate,
      electionDate,
    )

    return getListOfTasks(weekNumber)
  }
}
