import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

// TODO: make schemas for the actual JSON content
export class UpdateCampaignSchema extends createZodDto(
  z
    .object({
      slug: z.string().optional(),
      data: z.record(z.string(), z.unknown()).optional(),
      details: z.record(z.string(), z.unknown()).optional(),
      pathToVictory: z.record(z.string(), z.unknown()).optional(),
      aiContent: z.record(z.string(), z.unknown()).optional(),
    })
    .strict(),
) {}
