import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

export class PatchOrganizationDto extends createZodDto(
  z.object({
    ballotReadyPositionId: z.string().nullable().optional(),
    overrideDistrictId: z.string().nullable().optional(),
    customPositionName: z.string().nullable().optional(),
  }),
) {}

export class AdminListOrganizationsDto extends createZodDto(
  z.object({
    slug: z.string().min(1).max(100).optional(),
    email: z.string().min(1).max(100).optional(),
  }),
) {}
