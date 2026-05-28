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
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
})

export const aiOutletsToolResultSchema = z.object({
  outlets: z.array(localNewsOutletSchema),
})

export const localNewsPendingResponseSchema = z.object({
  status: z.literal('pending'),
})

export const localNewsReadyResponseSchema = z.object({
  status: z.literal('ready'),
  outlets: z.array(localNewsOutletSchema),
})

export const localNewsResponseSchema = z.discriminatedUnion('status', [
  localNewsPendingResponseSchema,
  localNewsReadyResponseSchema,
])

export type LocalNewsOutlet = z.infer<typeof localNewsOutletSchema>
export type LocalNewsResponse = z.infer<typeof localNewsResponseSchema>
export type LocalNewsReadyResponse = z.infer<
  typeof localNewsReadyResponseSchema
>
