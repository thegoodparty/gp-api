import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

const createP2pJobRequestSchema = z.object({
  listId: z.coerce.number().int().positive(),
  scriptText: z.string().min(1, 'Script text is required'),
  identityId: z.string().min(1, 'Identity ID is required'),
  name: z.string().optional(),
  didState: z.string().optional(),
  title: z.string().optional(),
})

const createP2pJobResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
})

export class CreateP2pJobRequestDto extends createZodDto(
  createP2pJobRequestSchema,
) {}

export class CreateP2pJobResponseDto extends createZodDto(
  createP2pJobResponseSchema,
) {}
