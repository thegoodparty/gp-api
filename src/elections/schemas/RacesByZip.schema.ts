import { createZodDto } from 'nestjs-zod'
import { LEVELS } from 'src/shared/constants/governmentLevels'
import { ZipSchema } from '@goodparty_org/contracts'
import { z } from 'zod'

const OFFICE_TYPES = [
  'Attorney',
  'City Council',
  'Clerk/Treasurer',
  'Congressional',
  'County Supervisor',
  'Judge',
  'Mayor',
  'Other',
  'School Board',
  'Sheriff',
  'State House',
  'State Senate',
  'Statewide/Governor',
  'Town Council',
] as const

export class RacesByZipSchema extends createZodDto(
  z
    .object({
      zipcode: ZipSchema.optional(),
      level: z
        .string()
        .refine((val: string) => LEVELS.includes(val?.toUpperCase()), {
          message: 'invalid election level',
        })
        .optional(),
      name: z.string().min(1).optional(),
      officeType: z.preprocess(
        (v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v]),
        z.array(z.enum(OFFICE_TYPES)).optional(),
      ),
      electionDate: z.string().date().optional(),
    })
    .refine(
      (q) => q.zipcode || q.name || (q.officeType && q.officeType.length > 0),
      { message: 'At least one of zipcode, name, or officeType is required' },
    ),
) {}
