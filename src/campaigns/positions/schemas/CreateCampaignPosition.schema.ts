import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

export class CreateCampaignPositionSchema extends createZodDto(
  z
    .object({
      description: z.string(),
      order: z.number(),
      campaignId: z.number(),
      positionId: z.number(),
      topIssueId: z.number(),
    })
    .strict(),
) {}
