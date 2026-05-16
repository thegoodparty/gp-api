import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

const anchorSchema = z
  .object({
    jsonPath: z.string().nullable(),
    start: z.number().int().nonnegative().nullable(),
    end: z.number().int().nonnegative().nullable(),
  })
  .refine(
    ({ jsonPath, start, end }) => {
      const allNull = jsonPath === null && start === null && end === null
      const allSet = jsonPath !== null && start !== null && end !== null
      return allNull || allSet
    },
    {
      message:
        'anchor fields must be all null (top-level) or all set (anchored)',
    },
  )

export const createBriefingChatSchema = z.object({
  meetingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  anchor: anchorSchema,
})

export class CreateBriefingChatSchema extends createZodDto(
  createBriefingChatSchema,
) {}

export const createBriefingChatResponseSchema = z.object({
  annotationId: z.string(),
  conversationId: z.string(),
})

export type CreateBriefingChatResponse = z.infer<
  typeof createBriefingChatResponseSchema
>
