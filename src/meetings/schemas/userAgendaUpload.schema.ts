import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

export const USER_AGENDA_MAX_BYTES = 75 * 1024 * 1024 // 75 MB

const ALLOWED_CONTENT_TYPES = ['application/pdf'] as const

export const UserAgendaPresignRequestSchema = z.object({
  contentType: z.enum(ALLOWED_CONTENT_TYPES),
  byteSize: z
    .number()
    .int()
    .positive()
    .max(USER_AGENDA_MAX_BYTES, {
      message: `byteSize exceeds ${USER_AGENDA_MAX_BYTES} (75 MB)`,
    }),
})
export type UserAgendaPresignRequest = z.infer<
  typeof UserAgendaPresignRequestSchema
>
export class UserAgendaPresignRequestDto extends createZodDto(
  UserAgendaPresignRequestSchema,
) {}

export const UserAgendaPresignResponseSchema = z.object({
  uploadId: z.string(),
  uploadKey: z.string(),
  uploadUrl: z.string().url(),
  expiresAt: z.string().datetime(),
})

/**
 * The finalize endpoint takes EITHER a pasted URL OR a completed S3 upload —
 * never both. discriminatedUnion enforces this at the schema level.
 *
 * Note: no `createZodDto` wrapper because nestjs-zod's DTO base requires a
 * single ZodObject; a discriminated union doesn't fit that constraint.
 * Controllers consume this via `@Body(new ZodValidationPipe(Schema)) body: Type`.
 */
export const UserAgendaFinalizeRequestSchema = z.discriminatedUnion('source', [
  z.object({
    source: z.literal('URL'),
    sourceUrl: z.string().url().max(2048),
  }),
  z.object({
    source: z.literal('UPLOAD'),
    uploadId: z.string().min(1),
    uploadKey: z.string().min(1),
  }),
])
export type UserAgendaFinalizeRequest = z.infer<
  typeof UserAgendaFinalizeRequestSchema
>

export const UserAgendaFinalizeResponseSchema = z.object({
  experimentRunId: z.string(),
  status: z.literal('processing'),
})
