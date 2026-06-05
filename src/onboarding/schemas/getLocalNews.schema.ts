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

// `.min(1)` enforces an outlet floor at validation time. If Gemini returns
// zero outlets for an obscure jurisdiction the structured stage throws, the
// catch in `runFetch` calls `expirePending`, and the next request retries
// instead of permanently caching `{ status: 'ready', outlets: [] }`.
export const aiOutletsToolResultSchema = z.object({
  outlets: z.array(localNewsOutletSchema).min(1),
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
