import { TcrComplianceStatus } from '@prisma/client'
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

export class SeedCampaignSchema extends createZodDto(
  z.object({
    campaignId: z.number().int().positive(),
    isPro: z.boolean().optional(),
    hasFreeTextsOffer: z.boolean().optional(),
    tcrComplianceStatus: z.nativeEnum(TcrComplianceStatus).optional(),
  }),
) {}
