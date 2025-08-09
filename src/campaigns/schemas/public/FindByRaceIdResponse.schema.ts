import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

const CampaignSchema = z.object({
  id: z.number(),
  slug: z.string(),
  details: z.record(z.string(), z.any()).nullable(),
  website: z.record(z.string(), z.any()).nullable(),
})

export class FindByRaceIdResponseDto extends createZodDto(CampaignSchema) {}

export type FindByRaceIdResponse = z.infer<typeof CampaignSchema> | null
