import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

export class submitCampaignVerifyPinDto extends createZodDto(
  z.object({
    pin: z.string(),
  }),
) {}
