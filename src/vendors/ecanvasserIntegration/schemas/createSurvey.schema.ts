import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

export enum SurveyStatus {
  Live = 'Live',
  NotLive = 'Not Live',
}

export class CreateSurveySchema extends createZodDto(
  z
    .object({
      name: z.string().min(1),
      description: z.string().min(1),
      requiresSignature: z.boolean().optional(),
      status: z.enum([SurveyStatus.Live, SurveyStatus.NotLive]).optional(),
      teamId: z.number().int().positive().optional(),
    })
    .strict(),
) {}
