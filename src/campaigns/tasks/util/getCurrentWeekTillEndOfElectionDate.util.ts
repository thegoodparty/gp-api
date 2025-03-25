import {
  DAY_OF_WEEK,
  findPreviousWeekDay,
} from '../../../shared/util/date.util'
import { differenceInDays } from 'date-fns'

export const getCurrentWeekTillEndOfElectionDate = (
  currentDate: Date,
  electionDate: Date,
): number => {
  const previousMonday = findPreviousWeekDay(electionDate, DAY_OF_WEEK.MONDAY)
  return (
    Math.ceil(
      (differenceInDays(electionDate, currentDate) -
        differenceInDays(electionDate, previousMonday)) /
        7,
    ) + 1
  )
}
