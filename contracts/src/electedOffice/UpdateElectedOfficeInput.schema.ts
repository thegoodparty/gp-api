import { z } from 'zod'

export const UpdateElectedOfficeInputSchema = z
  .object({
    electedDate: z.string().nullable().optional(),
    swornInDate: z.string().nullable().optional(),
    termStartDate: z.string().nullable().optional(),
    termEndDate: z.string().nullable().optional(),
    termLengthDays: z.number().nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .strict()

export type UpdateElectedOfficeInput = z.infer<typeof UpdateElectedOfficeInputSchema>
