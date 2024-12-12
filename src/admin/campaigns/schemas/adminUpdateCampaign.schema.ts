import { CampaignTier } from '@prisma/client'
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

export class AdminUpdateCampaignSchema extends createZodDto(
  z
    .object({
      isVerified: z.boolean().nullable().optional(),
      tier: z.nativeEnum(CampaignTier).nullable().optional(),
      isPro: z.boolean().optional(),
      didWin: z.boolean().nullable().optional(),
    })
    .strict(),
) {}
