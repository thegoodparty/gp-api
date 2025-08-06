import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

const uploadPhoneListResponseSchema = z.object({
  token: z.string(),
})

const phoneListStatusResponseSchema = z.object({
  list_status: z.string(),
  list_id: z.number().optional(),
})

export class UploadPhoneListResponseDto extends createZodDto(
  uploadPhoneListResponseSchema,
) {}
export class PhoneListStatusResponseDto extends createZodDto(
  phoneListStatusResponseSchema,
) {}
