import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import {
  CUSTOM_CHANNELS,
  CUSTOM_FILTERS,
  CUSTOM_PURPOSES,
  VoterFileType,
} from '../voterFile.types'
import { ALLOWED_COLUMNS } from '../../constants/allowedColumns.const'
import { CampaignTaskType } from 'src/campaigns/tasks/campaignTasks.types'
import { parseJsonString } from 'src/shared/util/zod.util'

const LOWER_CASE_TYPE_MAP = {
  doorknocking: VoterFileType.doorKnocking,
  directmail: VoterFileType.directMail,
}

const SelectedColumnSchema = z.object({
  db: z.enum(ALLOWED_COLUMNS as [string, ...string[]]),
  label: z.string().optional(),
})

export class GetVoterFileSchema extends createZodDto(
  z.object({
    type: z.preprocess(
      (val) => {
        // check if val is a lowercase version
        return LOWER_CASE_TYPE_MAP[val as string] ?? val
      },
      z.union([z.nativeEnum(VoterFileType), z.nativeEnum(CampaignTaskType)]),
    ),
    customFilters: parseJsonString(
      z
        .object({
          channel: z.enum(CUSTOM_CHANNELS).optional(),
          purpose: z.enum(CUSTOM_PURPOSES).optional(),
          filters: z.array(z.enum(CUSTOM_FILTERS)),
        })
        .optional(),
    ),
    countOnly: z.coerce.boolean().optional(),
    selectedColumns: parseJsonString(
      z
        .array(SelectedColumnSchema)
        .min(1)
        .max(50)
        .refine((cols) => new Set(cols.map((c) => c.db)).size === cols.length)
        .optional(),
    ),
    limit: z.coerce.number().optional(),
    slug: z.string().optional(),
  }),
) {}
