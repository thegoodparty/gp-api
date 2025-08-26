import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { OutreachStatus, OutreachType } from '@prisma/client'

export class CreateOutreachSchema extends createZodDto(
  z
    .object({
      campaignId: z.coerce.number().int().positive(),
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
      date: z.string().datetime({ offset: true }).optional(),
      imageUrl: z.string().url().optional(),
      voterFileFilterId: z.coerce.number().int().positive().optional(),
      phoneListId: z.coerce.number().int().positive().optional(),
      // P2P-specific fields
      identityId: z.string().optional(),
      didState: z.string().optional(),
      title: z.string().optional(),
    })
    .strict()
    .superRefine((data, ctx) => {
      if (data.outreachType === OutreachType.p2p && !data.phoneListId) {
        ctx.addIssue({
          path: ['phoneListId'],
          code: z.ZodIssueCode.custom,
          message: 'Phone list ID is required for P2P outreach',
        })
      }
      if (data.outreachType === OutreachType.p2p && !data.identityId) {
        ctx.addIssue({
          path: ['identityId'],
          code: z.ZodIssueCode.custom,
          message: 'Identity ID is required for P2P outreach',
        })
      }
      if (data.outreachType === OutreachType.p2p && !data.script) {
        ctx.addIssue({
          path: ['script'],
          code: z.ZodIssueCode.custom,
          message: 'Script is required for P2P outreach',
        })
      }
    }),
) {}
