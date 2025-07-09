import { createZodDto } from 'nestjs-zod'
import { STATE_CODES } from 'src/shared/constants/states'
import { toUpper } from 'src/shared/util/strings.util'
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
  state: z.preprocess(toUpper, z.string()).refine((val) => {
    if (!val) return true
    return STATE_CODES.includes(val)
  }, 'Invalid state code'),
  electionYear: z.coerce.number().int(),
})

const getDistrictNamesSchema = z.object({
  state: z.preprocess(toUpper, z.string()).refine((val) => {
    if (!val) return true
    return STATE_CODES.includes(val)
  }, 'Invalid state code'),
  electionYear: z.coerce.number().int(),
  L2DistrictType: z.string(),
})

export class GetDistrictTypesDTO extends createZodDto(getDistrictTypesSchema) {}
export class GetDistrictNamesDTO extends createZodDto(getDistrictNamesSchema) {}
