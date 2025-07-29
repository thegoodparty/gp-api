import { createZodDto } from 'nestjs-zod'
import { STATE_CODES } from 'src/shared/constants/states'
import { z } from 'zod'
import {
  DistrictSourceColumns,
  ProjectedTurnoutSourceColumns,
} from '../types/elections.types'

export const districtColumns = Object.values(
  DistrictSourceColumns,
) as (keyof typeof DistrictSourceColumns)[]

export const projectedTurnoutColumns = Object.values(
  ProjectedTurnoutSourceColumns,
) as (keyof typeof ProjectedTurnoutSourceColumns)[]

const getDistrictTypesSchema = z.object({
  state: z
    .string()
    .transform((v) => v.toUpperCase())
    .refine((v) => STATE_CODES.includes(v), 'Invalid state code'),
  electionYear: z.coerce.number().int(),
})

const getDistrictNamesSchema = z.object({
  state: z
    .string()
    .transform((v) => v.toUpperCase())
    .refine((v) => STATE_CODES.includes(v), 'Invalid state code'),
  electionYear: z.coerce.number().int(),
  L2DistrictType: z.string(),
})

export class GetDistrictTypesDTO extends createZodDto(getDistrictTypesSchema) {}
export class GetDistrictNamesDTO extends createZodDto(getDistrictNamesSchema) {}
