import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

const uploadPhoneListResponseSchema = z.object({
  Data: z.object({
    token: z.string(),
    account_id: z.string().optional(),
    list_name: z.string().optional(),
    list_state: z.string().optional(),
    pending_list_id: z.number().optional(),
  }),
})

const phoneListStatusResponseSchema = z.object({
  Data: z.object({
    list_status: z.string().optional(),
    list_state: z.string().optional(),
    list_id: z.number().optional(),
  }),
})

export class UploadPhoneListResponseDto extends createZodDto(
  uploadPhoneListResponseSchema,
) {}
export class PhoneListStatusResponseDto extends createZodDto(
  phoneListStatusResponseSchema,
) {}
