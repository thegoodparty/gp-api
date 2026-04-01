import { CampaignUpdateHistoryType } from '@prisma/client'
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

export const completeTaskBodySchema = z.object({
  type: z.nativeEnum(CampaignUpdateHistoryType),
  quantity: z.number().int().min(1),
})

export class CompleteTaskBodySchema extends createZodDto(
  completeTaskBodySchema,
) {}
