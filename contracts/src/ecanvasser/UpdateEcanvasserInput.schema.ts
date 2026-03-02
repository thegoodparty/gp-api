import { z } from 'zod'

export const UpdateEcanvasserInputSchema = z
  .object({
    apiKey: z.string().min(1).optional(),
  })
  .strict()

export type UpdateEcanvasserInput = z.infer<typeof UpdateEcanvasserInputSchema>
