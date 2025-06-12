import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

export class ScheduleOutreachCampaignSchema extends createZodDto(
  z.object({
    outreachId: z.number().int(),
  }),
) {}
