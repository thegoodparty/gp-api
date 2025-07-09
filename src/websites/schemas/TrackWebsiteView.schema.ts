import { z } from 'zod'
import { createZodDto } from 'nestjs-zod'

export class TrackWebsiteViewSchema extends createZodDto(
  z.object({
    visitorId: z.string(),
  }),
) {}
