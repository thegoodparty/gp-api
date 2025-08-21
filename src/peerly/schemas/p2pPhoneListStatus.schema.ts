import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

const checkPhoneListStatusResponseSchema = z.object({
  phoneListId: z.number(),
  leadsLoaded: z.number(),
})

export class CheckPhoneListStatusResponseDto extends createZodDto(
  checkPhoneListStatusResponseSchema,
) {}
