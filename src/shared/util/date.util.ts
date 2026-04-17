import {
  DateArg,
  endOfDay,
  format,
  parse,
  startOfDay,
  subDays,
  subWeeks,
} from 'date-fns'

export const toDateOnlyString = (d?: Date | null) => {
  return d ? d.toISOString().slice(0, 10) : undefined
}

export enum DateFormats {
  isoDate = 'yyyy-MM-dd',
  usDate = 'MMMM d, yyyy',
  crmPropertyMonthDate = 'MMMyy',
  usIsoSlashes = 'MM/dd/yyyy',
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

export const parseIsoDateString = (dateString: string) =>
  parse(dateString, DateFormats.isoDate, new Date())

export const isValidIsoDate = (value: string): boolean => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = parseIsoDateString(value)
  return !isNaN(parsed.getTime())
}

export const dateFromWeeksBefore = (
  referenceDate: Date,
  weeks: number,
): string => formatDate(subWeeks(referenceDate, weeks), DateFormats.isoDate)

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
