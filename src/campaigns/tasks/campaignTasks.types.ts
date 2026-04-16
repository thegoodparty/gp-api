export { CampaignTaskType } from '@prisma/client'
import type { CampaignTaskType } from '@prisma/client'

export type CampaignTask = {
  id?: string
  title: string
  description: string
  cta?: string
  flowType?: CampaignTaskType
  week: number
  date: string
  link?: string
  proRequired?: boolean
  isDefaultTask?: boolean
  deadline?: number
  defaultAiTemplateId?: string
}

export type CampaignTaskTemplate = Omit<CampaignTask, 'date'>

export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6

export type RecurrenceRule =
  | { type: 'weekly'; dayOfWeek: DayOfWeek }
  | { type: 'monthlyNthDay'; dayOfWeek: DayOfWeek; occurrences: number[] }
  | {
      type: 'weeksBeforeElection'
      dayOfWeek: DayOfWeek
      weeksBefore: number
    }

export type RecurringTaskTemplate = {
  title: string
  description: string
  recurrence: RecurrenceRule
  flowType?: CampaignTaskType
  proRequired?: boolean
  defaultAiTemplateId?: string
}
