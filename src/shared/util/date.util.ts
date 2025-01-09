import { DateArg, format } from 'date-fns'

export enum DateFormats {
  isoDate = 'yyyy-MM-dd',
  usDate = 'MMMM d, yyyy',
}

export function formatDate(
  date: DateArg<Date> & {},
  formatString: DateFormats,
) {
  return format(date, formatString)
}
