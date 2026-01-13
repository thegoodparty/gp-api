import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

export class TrackWebsiteViewSchema extends createZodDto(
  z.object({
    visitorId: z.string(),
  }),
) {}
