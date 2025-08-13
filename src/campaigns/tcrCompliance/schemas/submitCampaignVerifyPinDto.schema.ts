import { z } from 'zod'
import { createZodDto } from 'nestjs-zod'

export class submitCampaignVerifyPinDto extends createZodDto(
  z.object({
    pin: z.string(),
  }),
) {}
