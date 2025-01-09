import { format } from 'date-fns'

export enum DateFormats {
  isoDate = 'yyyy-MM-dd',
}

export function formatDate(date: Date, formatString: DateFormats) {
  return format(date, formatString)
}
