import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

// TODO: make schemas for the actual JSON content
export class UpdateCampaignSchema extends createZodDto(
  z.object({
    data: z.record(z.string(), z.unknown()).optional(),
    details: z.record(z.string(), z.unknown()).optional(),
    pathToVictory: z.record(z.string(), z.unknown()).optional(),
  }),
) {}
