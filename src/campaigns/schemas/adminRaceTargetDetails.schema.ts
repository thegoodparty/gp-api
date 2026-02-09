import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

const updateRaceTargetDetailsBySlugQuerySchema = z.object({
  includeTurnout: z.preprocess(
    (val) =>
      val === 'true' || val === '1' || val === 1 || val === true
        ? true
        : val === 'false' || val === '0' || val === 0 || val === false
          ? false
          : undefined,
    z.boolean().optional(),
  ),
})

export class UpdateRaceTargetDetailsBySlugQueryDTO extends createZodDto(
  updateRaceTargetDetailsBySlugQuerySchema,
) {}
