import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

const getLocalNewsQuerySchema = z.object({
  city: z.string().min(1).optional(),
  state: z.string().min(2).max(2),
  office: z.string().min(1),
})

export class GetLocalNewsQueryDTO extends createZodDto(
  getLocalNewsQuerySchema,
) {}

export const localNewsOutletSchema = z.object({
  name: z.string(),
  type: z.enum(['TV', 'print', 'radio']),
  description: z.string(),
})

export const localNewsResponseSchema = z.object({
  outlets: z.array(localNewsOutletSchema),
})

export type LocalNewsOutlet = z.infer<typeof localNewsOutletSchema>
export type LocalNewsResponse = z.infer<typeof localNewsResponseSchema>
