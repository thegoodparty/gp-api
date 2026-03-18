import { z } from 'zod'
import { createZodDto } from 'nestjs-zod'

export class SubmitCampaignVerifyPinDto extends createZodDto(
  z.object({
    pin: z.string(),
  }),
) {}
