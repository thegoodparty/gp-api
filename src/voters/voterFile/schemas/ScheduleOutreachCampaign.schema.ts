import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

export class ScheduleOutreachCampaignSchema extends createZodDto(
  z.object({
    outreachId: z.coerce
      .number()
      .int()
      .positive(
        'outreachId must be the id from the created outreach (POST /outreach) response',
      ),
    audienceRequest: z.string().optional(),
    campaignPlanDueDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'campaignPlanDueDate must be YYYY-MM-DD')
      .optional(),
  }),
) {}
