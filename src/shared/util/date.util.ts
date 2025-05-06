import {
  addDays,
  DateArg,
  format,
  parse,
  startOfWeek,
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
