import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

export class CreateCampaignSchema extends createZodDto(
  z.object({ slug: z.string() }),
) {}
