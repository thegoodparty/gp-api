import { z } from 'zod'

export const CreateEcanvasserInputSchema = z
  .object({
    apiKey: z.string().min(1),
    email: z.string().email(),
  })
  .strict()

export type CreateEcanvasserInput = z.infer<typeof CreateEcanvasserInputSchema>
