import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import {
  CUSTOM_CHANNELS,
  CUSTOM_FILTERS,
  CUSTOM_PURPOSES,
  VoterFileType,
} from '../voterFile.types'

const CustomFiltersSchema = z.object({
  channel: z.enum(CUSTOM_CHANNELS),
  purpose: z.enum(CUSTOM_PURPOSES),
  filters: z.array(z.enum(CUSTOM_FILTERS)), // TODO: validate for specific filter keys
})

export class GetVoterFileSchema extends createZodDto(
  z.object({
    type: z.nativeEnum(VoterFileType),
    customFilters: z.preprocess((input, ctx) => {
      if (input === undefined) return

      try {
        return JSON.parse(input as string)
      } catch (e) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'customFilters must be valid JSON string',
        })
      }
    }, CustomFiltersSchema.optional()),
    countOnly: z.boolean().optional(),
  }),
) {}
