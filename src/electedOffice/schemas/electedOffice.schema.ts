import { z } from 'zod'
import { createZodDto } from 'nestjs-zod'
import { ZDateOnly } from 'src/shared/schemas/DateOnly.schema'

export const ZDateOnlyOptional = ZDateOnly.optional()

export const ZDateOnlyNullOptional = ZDateOnly.nullable().optional()

export const CreateElectedOfficeSchema = z.object({
  swornInDate: ZDateOnlyOptional,
})

export const UpdateElectedOfficeSchema = z.object({
  swornInDate: ZDateOnlyNullOptional,
})

export class CreateElectedOfficeDto extends createZodDto(
  CreateElectedOfficeSchema,
) {}

export class UpdateElectedOfficeDto extends createZodDto(
  UpdateElectedOfficeSchema,
) {}

export type CreateElectedOfficeInput = z.infer<typeof CreateElectedOfficeSchema>
export type UpdateElectedOfficeInput = z.infer<typeof UpdateElectedOfficeSchema>
