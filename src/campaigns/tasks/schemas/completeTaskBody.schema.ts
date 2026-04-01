import { CampaignUpdateHistoryType } from '@prisma/client'
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

export class CompleteTaskBodySchema extends createZodDto(
  z.object({
    type: z.nativeEnum(CampaignUpdateHistoryType),
    quantity: z.number().int().min(1),
  }),
) {}
