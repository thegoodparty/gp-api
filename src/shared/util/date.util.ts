import {
  addDays,
  addHours,
  DateArg,
  endOfDay,
  format,
  parse,
  startOfDay,
  startOfWeek,
  subDays,
  subWeeks,
} from 'date-fns'

export enum DateFormats {
  isoDate = 'yyyy-MM-dd',
  usDate = 'MMMM d, yyyy',
  crmPropertyMonthDate = 'MMMyy',
}

export function formatDate(
  date: DateArg<Date> & {},
  formatString: DateFormats,
) {
  return format(date, formatString)
}

export const getMidnightForDate = (date: Date) =>
  new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  )

export enum DAY_OF_WEEK {
  SUNDAY = 0,
  MONDAY = 1,
  TUESDAY = 2,
  WEDNESDAY = 3,
  THURSDAY = 4,
  FRIDAY = 5,
  SATURDAY = 6,
}

export const findPreviousWeekDay = (
  endDate: Date,
  dayOfWeek: DAY_OF_WEEK = DAY_OF_WEEK.SUNDAY,
): Date => {
  const previousWeek = subWeeks(endDate, 1)
  const startOfPreviousWeek = startOfWeek(previousWeek)
  return addDays(startOfPreviousWeek, dayOfWeek)
}

export const parseIsoDateString = (dateString: string) =>
  parse(dateString, DateFormats.isoDate, new Date())

export const getDateRangeWithDefaults = (
  startDate?: Date,
  endDate?: Date,
  defaultDaysBack: number = 6,
) => {
  return {
    startDate: startDate
      ? startOfDay(startDate)
      : startOfDay(subDays(new Date(), defaultDaysBack)),
    endDate: endDate ? endOfDay(endDate) : endOfDay(new Date()),
  }
}
export const getTwelveHoursFromDate = (date: Date = new Date()) =>
  addHours(date, 12)
