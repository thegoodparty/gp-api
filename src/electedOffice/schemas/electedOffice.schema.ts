import { z } from 'zod'
import { createZodDto } from 'nestjs-zod'
import { ZDateOnly } from 'src/shared/schemas/DateOnly.schema'

export const ZDateOnlyOptional = ZDateOnly.optional()

export const ZDateOnlyNullOptional = ZDateOnly.nullable().optional()

export const CreateElectedOfficeSchema = z.object({
  electedDate: ZDateOnly,
  swornInDate: ZDateOnlyOptional,
  termStartDate: ZDateOnlyOptional,
  termEndDate: ZDateOnlyOptional,
  termLengthDays: z.coerce.number().int().positive().optional(),
  isActive: z.boolean().optional().default(true),
})

export const UpdateElectedOfficeSchema = z.object({
  electedDate: ZDateOnlyNullOptional,
  swornInDate: ZDateOnlyNullOptional,
  termStartDate: ZDateOnlyNullOptional,
  termEndDate: ZDateOnlyNullOptional,
  termLengthDays: z.coerce.number().int().positive().nullable().optional(),
  isActive: z.boolean().optional(),
})

export class CreateElectedOfficeDto extends createZodDto(
  CreateElectedOfficeSchema,
) {}

export class UpdateElectedOfficeDto extends createZodDto(
  UpdateElectedOfficeSchema,
) {}

export type CreateElectedOfficeInput = z.infer<typeof CreateElectedOfficeSchema>
export type UpdateElectedOfficeInput = z.infer<typeof UpdateElectedOfficeSchema>
