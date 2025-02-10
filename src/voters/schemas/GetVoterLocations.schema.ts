import { createZodDto } from 'nestjs-zod'
import { StateSchema } from 'src/shared/schemas'
import { z } from 'zod'

export class GetVoterLocationsSchema extends createZodDto(
  z.object({
    electionType: z.string(),
    state: StateSchema(),
  }),
) {}
