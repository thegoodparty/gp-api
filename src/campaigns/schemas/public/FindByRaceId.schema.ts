import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

const FindByRaceIdSchema = z.object({
  raceId: z.string().min(1, 'Race ID is required'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
})

export class FindByRaceIdDto extends createZodDto(FindByRaceIdSchema) {}
