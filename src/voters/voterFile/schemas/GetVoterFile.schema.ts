import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import {
  CUSTOM_CHANNELS,
  CUSTOM_FILTERS,
  CUSTOM_PURPOSES,
  VoterFileType,
} from '../voterFile.types'
import { parseJsonString } from 'src/shared/util/zod.util'

export class GetVoterFileSchema extends createZodDto(
  z.object({
    type: z.nativeEnum(VoterFileType),
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
  }),
) {}
