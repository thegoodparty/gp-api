import { createZodDto } from 'nestjs-zod'
import { z, ZodBoolean, ZodOptional, ZodString } from 'zod'
import { CUSTOM_FILTERS, CustomFilter, VoterFileType } from '../voterFile.types'
import { isNumeric } from 'validator'
import { parseJsonString } from 'src/shared/util/zod.util'

export class ScheduleOutreachCampaignSchema extends createZodDto(
  z.object({
    budget: z.string().refine(isNumeric),
    audience: parseJsonString(
      z
        .object(
          CUSTOM_FILTERS.reduce(
            (acc, filterKey) => {
              acc[filterKey] = z.boolean().optional()
              return acc
            },
            {
              audience_request: z.string().optional(),
            },
          ) as {
            [key in CustomFilter]: ZodOptional<ZodBoolean>
          } & { audience_request: ZodOptional<ZodString> },
        )
        .strict(),
    ),
    script: z.string(),
    date: z.string().date(),
    message: z.string(),
    voicemail: z.boolean().optional(),
    type: z.enum([VoterFileType.sms, VoterFileType.telemarketing]),
  }),
) {}
