import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { CUSTOM_FILTERS, VoterFileType } from '../voterFile.types'
import { isNumeric } from 'validator'
import { parseJsonString } from 'src/shared/util/zod.util'
import { CampaignTaskType } from 'src/campaigns/tasks/campaignTasks.types'
import { addDays, isAfter, startOfDay, parseISO } from 'date-fns'

export class ScheduleOutreachCampaignSchema extends createZodDto(
  z.object({
    budget: z.string().refine(isNumeric),
    audience: parseJsonString(
      z
        .object(
          CUSTOM_FILTERS.reduce(
            (acc, filterKey) => {
              acc[filterKey] =
                filterKey === 'audience_request'
                  ? z.string().optional()
                  : z.boolean().optional()
              return acc
            },
            {} as Record<string, z.ZodType>,
          ),
        )
        .strict(),
    ),
    script: z.string(),
    date: z
      .string()
      .date()
      .refine(
        (date) => {
          const selectedDate = startOfDay(parseISO(date))
          const minDate = startOfDay(addDays(new Date(), 3))
          return (
            isAfter(selectedDate, minDate) ||
            selectedDate.getTime() === minDate.getTime()
          )
        },
        {
          message: 'Date must be at least 72 hours from now',
        },
      ),
    message: z.string().optional(),
    voicemail: z.boolean().optional(),
    type: z.enum([
      VoterFileType.sms,
      VoterFileType.telemarketing,
      CampaignTaskType.text,
      CampaignTaskType.robocall,
    ]),
  }),
) {}
