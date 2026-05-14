import {
  DateArg,
  endOfDay,
  format,
  isBefore,
  isValid,
  parse,
  parseISO,
  startOfDay,
  subDays,
} from 'date-fns'

const ISO_DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/

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

/**
 * Parses 'YYYY-MM-DD' as UTC midnight. Use this when downstream code reads
 * the Date with `getUTCMonth()` / `getUTCFullYear()` and the source value
 * is a calendar date with no wall-clock-time intent — `parseIsoDateString`
 * (and `parseISO` directly) interpret bare 'YYYY-MM-DD' as LOCAL midnight,
 * which causes month/year wrap-around on servers east of UTC (e.g. local
 * 2026-01-01 → UTC 2025-12-31). Inputs that already carry a TZ offset are
 * passed through unchanged.
 */
export const parseIsoDateAsUTC = (dateString: string): Date =>
  ISO_DATE_ONLY_RE.test(dateString)
    ? parseISO(`${dateString}T00:00:00Z`)
    : parseISO(dateString)

export const isDateTodayOrFuture = (
  dateString: string | undefined | null,
  today: Date = startOfDay(new Date()),
): boolean => {
  if (!dateString) return false
  const date = parseIsoDateString(dateString)
  if (!isValid(date)) return false
  return !isBefore(startOfDay(date), today)
}

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
