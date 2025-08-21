import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

const checkPhoneListStatusSuccessResponseSchema = z.object({
  success: z.literal(true),
  phoneListId: z.number(),
  leadsLoaded: z.number(),
})

const checkPhoneListStatusFailureResponseSchema = z.object({
  success: z.literal(false),
  message: z.string(),
})

export class CheckPhoneListStatusSuccessResponseDto extends createZodDto(
  checkPhoneListStatusSuccessResponseSchema,
) {}

export class CheckPhoneListStatusFailureResponseDto extends createZodDto(
  checkPhoneListStatusFailureResponseSchema,
) {}
