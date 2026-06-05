import { CampaignUpdateHistoryType } from '../../../generated/prisma'
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

export class CreateUpdateHistorySchema extends createZodDto(
  z.object({
    type: z.nativeEnum(CampaignUpdateHistoryType),
    quantity: z.number(),
  }),
) {}
