import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

export class PatchOrganizationDto extends createZodDto(
  z.object({
    ballotReadyPositionId: z.string().optional(),
    overrideDistrictId: z.string().nullable().optional(),
    customPositionName: z.string().nullable().optional(),
  }),
) {}
