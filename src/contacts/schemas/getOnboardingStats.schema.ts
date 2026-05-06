import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

const getOnboardingStatsQuerySchema = z
  .object({
    districtId: z.string().min(1).optional(),
    ballotReadyPositionId: z.string().min(1).optional(),
  })
  .refine((value) => Boolean(value.districtId || value.ballotReadyPositionId), {
    message: 'Either districtId or ballotReadyPositionId is required',
    path: ['districtId'],
  })

export class GetOnboardingStatsQueryDTO extends createZodDto(
  getOnboardingStatsQuerySchema,
) {}
