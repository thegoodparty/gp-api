import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

export class UpdateCampaignPositionSchema extends createZodDto(
  z
    .object({
      description: z.string(),
      order: z.number(),
    })
    .strict(),
) {}
