import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { PathToVictoryDataSchema } from './PathToVictoryData.schema'

const updatePathToVictoryM2MSchema = z.object({
  data: PathToVictoryDataSchema.strict(),
})

export class UpdatePathToVictoryM2MSchema extends createZodDto(
  updatePathToVictoryM2MSchema,
) {}
