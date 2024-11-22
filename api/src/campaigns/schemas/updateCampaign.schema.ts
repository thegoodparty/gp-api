import { z } from 'zod'

const jsonStringSchema = z
  .string()
  .transform((str, ctx) => {
    try {
      return JSON.parse(str)
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Invalid JSON field',
      })
      return undefined
    }
  })
  .optional()

// TODO: make schemas for the actual JSON content
export const updateCampaignSchema = z.object({
  data: jsonStringSchema.pipe(z.record(z.unknown()).optional()),
  details: jsonStringSchema.pipe(z.record(z.unknown()).optional()),
  pathToVictory: jsonStringSchema.pipe(z.record(z.unknown()).optional()),
})

export type UpdateCampaignBody = z.infer<typeof updateCampaignSchema>
