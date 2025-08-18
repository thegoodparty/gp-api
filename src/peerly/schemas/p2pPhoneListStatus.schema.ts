import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

const checkPhoneListStatusRequestSchema = z.object({
  token: z.string().min(1, 'Token is required'),
})

const checkPhoneListStatusSuccessResponseSchema = z.object({
  success: z.literal(true),
  phone_list_id: z.number(),
  leads_loaded: z.number(),
})

const checkPhoneListStatusFailureResponseSchema = z.object({
  success: z.literal(false),
  message: z.string(),
})

export class CheckPhoneListStatusRequestDto extends createZodDto(
  checkPhoneListStatusRequestSchema,
) {}

export class CheckPhoneListStatusSuccessResponseDto extends createZodDto(
  checkPhoneListStatusSuccessResponseSchema,
) {}

export class CheckPhoneListStatusFailureResponseDto extends createZodDto(
  checkPhoneListStatusFailureResponseSchema,
) {}
