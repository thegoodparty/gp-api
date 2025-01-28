import { format, startOfDay } from 'date-fns'

export const formatDateForCRM = (date) =>
  date ? startOfDay(new Date(date)).getTime().toString() : undefined
