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

const LOWER_CASE_TYPE_MAP = {
  doorknocking: VoterFileType.doorKnocking,
  directmail: VoterFileType.directMail,
}

const SelectedColumnSchema = z.object({
  db: z
    .string()
    .min(1, 'Column name cannot be empty')
    .refine(
      (val) => ALLOWED_COLUMNS.includes(val),
      (val) => ({
        message: `Invalid column name: ${val}. Must be one of the allowed columns.`,
      }),
    ),
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
    customFilters: z.preprocess(
      (val) => (typeof val === 'string' ? JSON.parse(val) : val),
      z
        .object({
          channel: z.enum(CUSTOM_CHANNELS).optional(),
          purpose: z.enum(CUSTOM_PURPOSES).optional(),
          filters: z.array(z.enum(CUSTOM_FILTERS)),
        })
        .optional(),
    ),
    countOnly: z.coerce.boolean().optional(),
    selectedColumns: z.preprocess(
      (val) => (typeof val === 'string' ? JSON.parse(val) : val),
      z
        .array(SelectedColumnSchema)
        .min(1, 'selectedColumns must contain at least one column')
        .max(50, 'Too many columns selected')
        .refine(
          (cols) => new Set(cols.map((c) => c.db)).size === cols.length,
          'Duplicate column names are not allowed',
        )
        .optional(),
    ),
    limit: z.coerce.number().optional(),
    slug: z.string().optional(),
  }),
) {}
