import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

export class RefreshCompanySchema extends createZodDto(
  z.object({
    campaignId: z.coerce.number().optional(),
  }),
) {}

export class MassRefreshCompanySchema extends createZodDto(
  z.object({
    fields: z.array(z.string()),
  }),
) {}

export class SyncCampaignSchema extends createZodDto(
  z.object({
    campaignId: z.coerce.number().optional(),
    resync: z.boolean().optional(),
  }),
) {}
