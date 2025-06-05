import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { OutreachStatus, OutreachType } from '@prisma/client'

export class CreateOutreachSchema extends createZodDto(
  z
    .object({
      campaignId: z.number().int().positive(),
      outreachType: z.nativeEnum(OutreachType),
      projectId: z.string().optional(),
      name: z.string().optional(),
      status: z
        .nativeEnum(OutreachStatus)
        .optional()
        .default(OutreachStatus.pending),
      error: z.string().optional(),
      audienceRequest: z.string().optional(),
      script: z.string().optional(),
      message: z.string().optional(),
      date: z.string().datetime().optional(),
      imageUrl: z.string().url().optional(),
      voterFileFilterId: z.number().int().positive().optional(),
    })
    .strict(),
) {}
